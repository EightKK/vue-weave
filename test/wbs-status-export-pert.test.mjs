import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createSSRApp, h } from 'vue'
import { renderToString } from 'vue/server-renderer'
import {
  createTimeScale, indentTimelineRow, moveTimelineRow, outdentTimelineRow, renderTimelineSvg, rescheduleFromStatusDate, scheduleTasks,
  scheduleToGraph, timelineCsvTable, timelineRowPosition, timelineWbsCodes, toCsv, toICalendar, toMsProjectXml,
} from 'vue-weave/core'
import { GanttChart } from 'vue-weave'

const hour = 3_600_000
const freeze = rows => Object.freeze(rows.map(row => Object.freeze({ ...row })))
const tree = freeze([
  { id: 'a', label: 'A' }, { id: 'b', label: 'B', parentId: 'a' }, { id: 'c', label: 'C', parentId: 'a' },
  { id: 'd', label: 'D', parentId: 'c' }, { id: 'e', label: 'E' },
])
const order = rows => rows.map(row => row.id + (row.parentId ? '<' + row.parentId : ''))

test('timelineWbsCodes numbers rows in tree preorder by sibling position', () => {
  assert.deepEqual([...timelineWbsCodes(tree)], [['a', '1'], ['b', '1.1'], ['c', '1.2'], ['d', '1.2.1'], ['e', '2']])
  // Sibling order is array order, even when a child is listed before its parent.
  const codes = timelineWbsCodes([{ id: 'x', label: 'X', parentId: 'r' }, { id: 'r', label: 'R' }, { id: 'y', label: 'Y', parentId: 'r' }])
  assert.deepEqual([...codes], [['r', '1'], ['x', '1.1'], ['y', '1.2']])
  assert.deepEqual([...timelineWbsCodes([])], [])
  assert.throws(() => timelineWbsCodes([{ id: 'a', label: 'A', parentId: 'b' }, { id: 'b', label: 'B', parentId: 'a' }]), /cycle/)
  assert.throws(() => timelineWbsCodes([{ id: 'a', label: 'A', parentId: 'missing' }]), /Unknown parent/)
})

test('moveTimelineRow moves a subtree in preorder, returns new rows and keeps the input', () => {
  const moved = moveTimelineRow(tree, 'c', { index: 0 })
  assert.deepEqual(order(moved), ['c', 'd<c', 'a', 'b<a', 'e'])
  assert.equal('parentId' in moved[0], false)
  assert.notEqual(moved[0], tree[2])
  // Untouched rows keep their identity; the input is unchanged.
  assert.equal(moved[1], tree[3])
  assert.equal(moved[2], tree[0])
  assert.deepEqual(order(tree), ['a', 'b<a', 'c<a', 'd<c', 'e'])
  assert.deepEqual([...timelineWbsCodes(moved)], [['c', '1'], ['d', '1.1'], ['a', '2'], ['b', '2.1'], ['e', '3']])
  // The index counts the new siblings without the moved row.
  assert.deepEqual(order(moveTimelineRow(tree, 'b', { parentId: 'a', index: 1 })), ['a', 'c<a', 'd<c', 'b<a', 'e'])
  assert.deepEqual(order(moveTimelineRow(tree, 'e', { parentId: 'd', index: 0 })), ['a', 'b<a', 'c<a', 'd<c', 'e<d'])
  assert.deepEqual(order(moveTimelineRow(tree, 'a', { index: 1 })), ['e', 'a', 'b<a', 'c<a', 'd<c'])
  assert.deepEqual(timelineRowPosition(tree, 'c'), { parentId: 'a', index: 1 })
  assert.deepEqual(timelineRowPosition(tree, 'e'), { index: 1 })
})

test('moveTimelineRow rejects unknown rows, moves into the own subtree and bad indexes', () => {
  assert.throws(() => moveTimelineRow(tree, 'missing', { index: 0 }), { name: 'Error', message: /Unknown row: missing/ })
  assert.throws(() => moveTimelineRow(tree, 'b', { parentId: 'missing', index: 0 }), { name: 'Error', message: /Unknown parent row/ })
  assert.throws(() => moveTimelineRow(tree, 'a', { parentId: 'd', index: 0 }), { name: 'Error', message: /own subtree/ })
  assert.throws(() => moveTimelineRow(tree, 'c', { parentId: 'c', index: 0 }), { name: 'Error', message: /own subtree/ })
  for (const index of [-1, 3, 1.5, Number.NaN]) assert.throws(() => moveTimelineRow(tree, 'e', { index }), RangeError)
  assert.throws(() => timelineRowPosition(tree, 'missing'), /Unknown row/)
})

test('indentTimelineRow and outdentTimelineRow follow the previous sibling and the parent', () => {
  assert.deepEqual(order(indentTimelineRow(tree, 'c')), ['a', 'b<a', 'c<b', 'd<c', 'e'])
  assert.deepEqual(order(indentTimelineRow(tree, 'e')), ['a', 'b<a', 'c<a', 'd<c', 'e<a'])
  assert.deepEqual(order(outdentTimelineRow(tree, 'd')), ['a', 'b<a', 'c<a', 'd<a', 'e'])
  assert.deepEqual(order(outdentTimelineRow(tree, 'b')), ['a', 'c<a', 'd<c', 'b', 'e'])
  assert.throws(() => indentTimelineRow(tree, 'a'), { name: 'Error', message: /cannot be indented/ })
  assert.throws(() => indentTimelineRow(tree, 'b'), { name: 'Error', message: /cannot be indented/ })
  assert.throws(() => outdentTimelineRow(tree, 'a'), { name: 'Error', message: /cannot be outdented/ })
  // Indenting and then outdenting the last child restores the order.
  assert.deepEqual(order(outdentTimelineRow(indentTimelineRow(tree, 'e'), 'e')), order(tree))
})

const plan = {
  range: { start: 0, end: 100 },
  tasks: [
    { id: 'a', duration: 10 }, { id: 'b', duration: 10 }, { id: 'c', duration: 10 }, { id: 'd', duration: 4 },
    { id: 'early', duration: 10, startNoEarlierThan: 20 }, { id: 'm', duration: 0 },
  ],
  dependencies: [{ id: 'ab', from: 'a', to: 'b' }, { id: 'bc', from: 'b', to: 'c' }, { id: 'cm', from: 'c', to: 'm' }],
}
const dates = result => Object.fromEntries(result.tasks.map(task => [task.id, [task.start, task.end, task.work.map(w => [w.start, w.end])]]))

test('rescheduleFromStatusDate keeps done work, splits partial tasks and moves unstarted work after the status date', () => {
  const snapshot = structuredClone(plan)
  const result = rescheduleFromStatusDate(plan, 15, new Map([['a', 1], ['b', 0.3], ['early', 0.5], ['m', 0.5]]))
  assert.equal(result.ok, true)
  const tasks = dates(result)
  // Done: unchanged. Partly done: 3 units kept at 10–13, the remaining 7 from the status date.
  assert.deepEqual(tasks.a, [0, 10, [[0, 10]]])
  assert.deepEqual(tasks.b, [10, 22, [[10, 13], [15, 22]]])
  // Not started: after the status date and after its predecessor.
  assert.deepEqual(tasks.c, [22, 32, [[22, 32]]])
  assert.deepEqual(tasks.d, [15, 19, [[15, 19]]])
  // Ahead of plan: the done half is placed to end at the status date; a milestone counts as not started.
  assert.deepEqual(tasks.early, [10, 20, [[10, 20]]])
  assert.deepEqual(tasks.m, [32, 32, []])
  assert.equal(result.finish, 32)
  // The dependency into the started task no longer applies.
  assert.deepEqual(result.criticalDependencyIds, ['bc', 'cm'])
  assert.deepEqual(plan, snapshot)
  // Without progress, every task starts at or after the status date.
  const fresh = dates(rescheduleFromStatusDate(plan, 15, new Map()))
  assert.deepEqual(fresh.a, [15, 25, [[15, 25]]])
  assert.deepEqual(fresh.early, [20, 30, [[20, 30]]])
})

test('rescheduleFromStatusDate splits around calendar breaks and rounds done work down to quanta', () => {
  const input = {
    range: { start: 0, end: 40 }, quantum: 1,
    calendars: [{ id: 'shift', periods: [{ start: 0, end: 4 }, { start: 6, end: 20 }] }], defaultCalendarId: 'shift',
    tasks: [{ id: 'x', duration: 6 }, { id: 'y', duration: 4 }],
  }
  assert.deepEqual(dates(scheduleTasks(input)).x, [0, 8, [[0, 4], [6, 8]]])
  const result = rescheduleFromStatusDate(input, 5, new Map([['x', 0.5], ['y', 0.2]]))
  // x: 3 units done at 0–3, paused until the status date, then 3 units from 6 (the break 4–6 is not working time).
  assert.deepEqual(dates(result).x, [0, 9, [[0, 3], [6, 9]]])
  // y: 0.2 × 4 rounds down to zero done units, so it is treated as not started.
  assert.deepEqual(dates(result).y, [6, 10, [[6, 10]]])
  // A fixed start before the status date makes an unstarted task infeasible.
  const fixed = rescheduleFromStatusDate({ ...input, tasks: [{ id: 'x', duration: 2, fixedStart: 0 }] }, 5, new Map())
  assert.equal(fixed.ok, false)
  assert.equal(fixed.code, 'infeasible')
})

const finishLinked = (type, lag, extra = {}) => ({
  range: { start: 0, end: 20 },
  tasks: [{ id: 'a', duration: 6 }, { id: 'b', duration: 4, ...extra }],
  dependencies: [{ id: 'ab', from: 'a', to: 'b', type, lag }],
})

test('rescheduleFromStatusDate keeps finish-to-finish links into started tasks and delays their remaining work', () => {
  const input = finishLinked('FF')
  assert.deepEqual(dates(scheduleTasks(input)).b, [2, 6, [[2, 6]]])
  const snapshot = structuredClone(input)
  // b is half done at the status date: its done half ends there, and its remaining half waits for a to finish.
  const result = rescheduleFromStatusDate(input, 2, new Map([['b', 0.5]]))
  assert.equal(result.ok, true)
  assert.deepEqual(dates(result).a, [2, 8, [[2, 8]]])
  assert.deepEqual(dates(result).b, [0, 8, [[0, 2], [6, 8]]])
  assert.deepEqual(result.criticalDependencyIds, ['ab'])
  assert.deepEqual(input, snapshot)
  // The lag is honoured.
  assert.deepEqual(dates(rescheduleFromStatusDate(finishLinked('FF', 3), 2, new Map([['b', 0.5]]))).b, [0, 11, [[0, 2], [9, 11]]])
  // A link that the remaining work already satisfies changes nothing.
  assert.deepEqual(dates(rescheduleFromStatusDate(finishLinked('FF', -6), 2, new Map([['b', 0.5]]))).b, [0, 4, [[0, 4]]])
  // On a calendar, the remaining work resumes as late as needed and no later; delays carry along a chain.
  const chain = rescheduleFromStatusDate({
    range: { start: 0, end: 40 },
    calendars: [{ id: 'shift', periods: [{ start: 0, end: 4 }, { start: 6, end: 40 }] }],
    tasks: [{ id: 'a', duration: 3 }, { id: 'b', duration: 4, calendarId: 'shift' }, { id: 'c', duration: 4 }],
    dependencies: [{ id: 'ab', from: 'a', to: 'b', type: 'FF', lag: 2 }, { id: 'bc', from: 'b', to: 'c', type: 'FF', lag: 1 }],
  }, 2, new Map([['b', 0.5], ['c', 0.5]]))
  assert.deepEqual(dates(chain).b, [0, 7, [[0, 2], [3, 4], [6, 7]]])
  assert.deepEqual(dates(chain).c, [0, 8, [[0, 2], [6, 8]]])
  assert.deepEqual(chain.criticalDependencyIds, ['ab', 'bc'])
})

test('rescheduleFromStatusDate keeps start-to-finish links into started tasks', () => {
  // b must finish no earlier than 5 units after a starts, and a, not started, moves to the status date 2.
  const result = rescheduleFromStatusDate(finishLinked('SF', 5), 2, new Map([['b', 0.5]]))
  assert.equal(result.ok, true)
  assert.deepEqual(dates(result).a, [2, 8, [[2, 8]]])
  assert.deepEqual(dates(result).b, [0, 7, [[0, 2], [5, 7]]])
})

test('rescheduleFromStatusDate drops start links into started tasks and every link into completed tasks', () => {
  for (const type of ['FS', 'SS']) {
    const result = rescheduleFromStatusDate(finishLinked(type, 8), 2, new Map([['b', 0.5]]))
    assert.equal(result.ok, true)
    assert.deepEqual(dates(result).b, [0, 4, [[0, 4]]])
    assert.deepEqual(result.criticalDependencyIds, [])
  }
  for (const type of ['FS', 'SS', 'FF', 'SF']) {
    const input = finishLinked(type, 1)
    const before = dates(scheduleTasks(input)).b
    const result = rescheduleFromStatusDate(input, 2, new Map([['b', 1]]))
    assert.equal(result.ok, true)
    assert.deepEqual(dates(result).b, before)
    assert.deepEqual(result.criticalDependencyIds, [])
  }
})

test('rescheduleFromStatusDate reports a kept finish link that cannot be met as infeasible', () => {
  // The link requires a finish at 8, after b's own finish bound 7.
  assert.deepEqual(rescheduleFromStatusDate(finishLinked('FF', 0, { finishNoLaterThan: 7 }), 2, new Map([['b', 0.5]])),
    { ok: false, code: 'infeasible', taskId: 'b', constraints: ['finishNoLaterThan'], dependencyIds: ['ab'] })
  // The required finish 21 lies after the horizon.
  assert.deepEqual(rescheduleFromStatusDate(finishLinked('FF', 13), 2, new Map([['b', 0.5]])),
    { ok: false, code: 'infeasible', taskId: 'b', constraints: ['range'], dependencyIds: ['ab'] })
  // The plan meets the deadline 9 with b at 2–6. At the status date 4, b is half done and a has not started, so a
  // moves to 4–8, still before the deadline, and the kept link requires b to finish at 10, after it.
  const deadlined = {
    range: { start: 0, end: 20 }, deadline: 9,
    tasks: [{ id: 'a', duration: 4 }, { id: 'b', duration: 4 }],
    dependencies: [{ id: 'ab', from: 'a', to: 'b', type: 'FF', lag: 2 }],
  }
  assert.deepEqual(dates(scheduleTasks(deadlined)).b, [2, 6, [[2, 6]]])
  assert.deepEqual(rescheduleFromStatusDate(deadlined, 4, new Map([['b', 0.5]])),
    { ok: false, code: 'infeasible', taskId: 'b', constraints: ['deadline'], dependencyIds: ['ab'] })
})

test('rescheduleFromStatusDate validates the status date and progress', () => {
  for (const status of [Number.NaN, Infinity, -1, 101]) assert.throws(() => rescheduleFromStatusDate(plan, status, new Map()), RangeError)
  for (const value of [-0.1, 1.5, Number.NaN]) assert.throws(() => rescheduleFromStatusDate(plan, 15, new Map([['a', value]])), RangeError)
  assert.throws(() => rescheduleFromStatusDate(plan, 15, new Map([['missing', 0.5]])), { name: 'Error', message: /Unknown task/ })
  assert.throws(() => rescheduleFromStatusDate({ ...plan, quantum: 2 }, 15, new Map()), RangeError)
  // A failing plan is returned unchanged.
  const cyclic = { ...plan, dependencies: [...plan.dependencies, { id: 'ca', from: 'c', to: 'a' }] }
  assert.equal(rescheduleFromStatusDate(cyclic, 15, new Map()).code, 'cycle')
})

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
  assert.throws(() => toMsProjectXml({ name: 'P', tasks: [task, task] }), { name: 'Error', message: /duplicate task/ })
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
  assert.throws(() => toICalendar([{ id: 'a', summary: 'A', start: 0, end: 1 }, { id: 'a', summary: 'B', start: 0, end: 1 }], { timestamp: 0 }), /duplicate/)
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

test('scheduleToGraph builds a PERT network with early dates, float and critical marking', () => {
  const dependencies = [
    { id: 'ab', from: 'a', to: 'b' }, { id: 'ac', from: 'a', to: 'c', type: 'SS' }, { id: 'bd', from: 'b', to: 'd' }, { id: 'cd', from: 'c', to: 'd' },
  ]
  const result = scheduleTasks({
    range: { start: 0, end: 20 * hour }, quantum: hour,
    tasks: [{ id: 'a', duration: 2 * hour }, { id: 'b', duration: 4 * hour }, { id: 'c', duration: hour }, { id: 'd', duration: hour }],
    dependencies,
  })
  const graph = scheduleToGraph(result, dependencies, { label: id => 'Task ' + id.toUpperCase() })
  assert.deepEqual(graph.nodes.map(node => [node.id, node.label, node.tone]), [
    ['a', 'Task A', 'amber'], ['b', 'Task B', 'amber'], ['c', 'Task C', 'blue'], ['d', 'Task D', 'amber'],
  ])
  assert.equal(graph.nodes[2].detail, 'ES 1970-01-01 00:00 · EF 1970-01-01 01:00 · Float 5 h')
  assert.equal(graph.nodes[2].data.earlyStart, 0)
  assert.deepEqual(graph.edges.map(edge => [edge.id, edge.from, edge.to, edge.label, edge.data.critical]), [
    ['ab', 'a', 'b', undefined, true], ['ac', 'a', 'c', 'SS', false], ['bd', 'b', 'd', undefined, true], ['cd', 'c', 'd', undefined, false],
  ])
  assert.deepEqual([...graph.criticalEdgeIds], ['ab', 'bd'])
  assert.deepEqual([...graph.criticalNodeIds], ['a', 'b', 'd'])
  const custom = scheduleToGraph(result, [], {
    formatTime: time => String(time / hour), formatDuration: value => value / hour + 'h', labels: { earlyStart: 'Start', float: 'Slack' }, tone: 'teal', criticalTone: 'violet',
  })
  assert.equal(custom.nodes[2].detail, 'Start 0 · EF 1 · Slack 5h')
  assert.deepEqual(custom.nodes.map(node => node.tone), ['violet', 'violet', 'teal', 'violet'])
  assert.throws(() => scheduleToGraph(result, [{ id: 'x', from: 'a', to: 'missing' }]), { name: 'Error', message: /Unknown dependency endpoint/ })
  assert.throws(() => scheduleToGraph({ ok: false, code: 'cycle', cycles: [] }, []), /successful/)
})

test('scheduleToGraph rejects a dependency from a task to itself', () => {
  const result = scheduleTasks({ range: { start: 0, end: 4 * hour }, quantum: hour, tasks: [{ id: 'a', duration: hour }, { id: 'b', duration: hour }] })
  assert.equal(result.ok, true)
  assert.throws(() => scheduleToGraph(result, [{ id: 'ab', from: 'a', to: 'b' }, { id: 'loop', from: 'b', to: 'b', type: 'SS' }]), {
    name: 'Error', message: 'Dependency loop links task b to itself',
  })
})

test('scheduleToGraph labels a non-zero dependency lag on its edge and keeps edges without lag unchanged', () => {
  const tasks = [{ id: 'a', duration: 2 * hour }, { id: 'b', duration: 4 * hour }, { id: 'c', duration: hour }, { id: 'd', duration: hour }]
  const plain = [
    { id: 'ab', from: 'a', to: 'b' }, { id: 'ac', from: 'a', to: 'c', type: 'SS' }, { id: 'bd', from: 'b', to: 'd' }, { id: 'cd', from: 'c', to: 'd', type: 'FF' },
  ]
  const lagged = [
    { ...plain[0], lag: 2 * hour }, { ...plain[1], lag: -hour / 2 }, { ...plain[2], lag: 0 }, plain[3],
  ]
  const result = scheduleTasks({ range: { start: 0, end: 20 * hour }, quantum: hour / 2, tasks, dependencies: lagged })
  assert.equal(result.ok, true)
  const graph = scheduleToGraph(result, lagged)
  assert.deepEqual(graph.edges.map(edge => [edge.id, edge.label, edge.data]), [
    ['ab', '+2 h', { type: 'FS', critical: true, lag: 2 * hour }],
    ['ac', 'SS −0.5 h', { type: 'SS', critical: false, lag: -hour / 2 }],
    ['bd', undefined, { type: 'FS', critical: true }],
    ['cd', 'FF', { type: 'FF', critical: false }],
  ])
  // A zero or missing lag gives the same edges as before lags existed.
  assert.deepEqual(scheduleToGraph(result, lagged.slice(2)).edges, scheduleToGraph(result, plain.slice(2)).edges)
  assert.equal(Object.hasOwn(graph.edges[2], 'label'), false)
  assert.equal(Object.hasOwn(graph.edges[2].data, 'lag'), false)

  const calls = []
  const custom = scheduleToGraph(result, lagged, { formatLag: lag => { calls.push(lag); return 'lag ' + lag / hour + 'h' } })
  assert.deepEqual(custom.edges.map(edge => edge.label), ['lag 2h', 'SS lag -0.5h', undefined, 'FF'])
  assert.deepEqual(calls, [2 * hour, -hour / 2])

  for (const lag of [Number.NaN, Infinity, '2']) {
    assert.throws(() => scheduleToGraph(result, [{ ...plain[0], lag }]), { name: 'RangeError', message: 'Dependency lag must be finite: ab' })
  }
})

const chartRows = [{ id: 'p', label: 'Parent' }, { id: 'r1', label: 'Row 1', parentId: 'p' }, { id: 'r2', label: 'Row 2' }]
const chartBars = [
  { id: 'a', rowId: 'r1', label: 'A', start: hour, end: 3 * hour, editable: true, progress: 0.5 },
  { id: 'b', rowId: 'r2', label: 'B', start: 4 * hour, end: 6 * hour },
]
const chartProps = { rows: chartRows, bars: chartBars, range: { start: 0, end: 10 * hour }, pixelsPerUnit: 10 / hour }
const render = (props = {}) => renderToString(createSSRApp({ render: () => h(GanttChart, { ...chartProps, ...props }) }))

test('GanttChart server markup is unchanged without rowsReorderable and statusDate', async () => {
  for (const extra of [{}, { markers: [{ id: 'x', time: 2 * hour, label: 'X' }], showNow: true, now: hour }, { dir: 'rtl', rowDraggable: true, creatable: true }]) {
    const plain = await render(extra)
    assert.equal(await render({ ...extra, rowsReorderable: false, showProgressLine: true, validateRowMove: () => false }), plain)
    assert.doesNotMatch(plain, /vw-row-move-handle|vw-reorderable|vw-gantt-status-date|vw-gantt-progress-line|reorder-hint|Status date/)
  }
  assert.doesNotMatch(await render({ rowsReorderable: true, readonly: true }), /vw-row-move-handle/)
})

test('GanttChart renders row move handles with names and a keyboard hint on the server', async () => {
  const html = await render({ rowsReorderable: true, creatable: row => row.id === 'r2', labels: { moveRow: 'Zeile verschieben' } })
  const handles = html.match(/<button type="button" class="vw-row-move-handle"[^>]*>/g)
  assert.equal(handles.length, 3)
  assert.match(handles[1], /data-vw-row-handle="r1" aria-label="Zeile verschieben Row 1" aria-describedby="(v-\d+)-reorder-hint"/)
  const hint = /aria-describedby="([^"]+-reorder-hint)"/.exec(html)[1]
  assert.match(html, new RegExp(`<span id="${hint}" class="vw-sr-only">Alt\\+Up and Alt\\+Down move the row among its siblings\\. Alt\\+Shift\\+Right indents`))
  // The parent keeps its toggle after the handle, and the creatable row keeps its add button.
  assert.match(html, /aria-label="Zeile verschieben Parent"[^>]*><span aria-hidden="true">⋮⋮<\/span><\/button><button type="button" class="vw-row-toggle"/)
  assert.match(html, /aria-label="Zeile verschieben Row 2"[^>]*>.*?<\/button><!----><button type="button" class="vw-gantt-create-button" aria-label="Add bar to Row 2">/)
  assert.match(await render({ rowsReorderable: true, dir: 'rtl' }), /Alt\+Shift\+Left indents it and Alt\+Shift\+Right outdents it/)
})

test('GanttChart renders the status date and a progress line on the server', async () => {
  const html = await render({ statusDate: 2.5 * hour, showProgressLine: true, labels: { statusDate: 'Stichtag' } })
  assert.match(html, /<div class="vw-gantt-marker vw-gantt-status-date" role="img" aria-label="Stichtag 02:30" title="Stichtag 02:30" style="left:calc\(var\(--vw-label-area-width\) \+ 25px\);"><span>Stichtag<\/span><\/div>/)
  const lines = html.match(/<svg class="vw-gantt-progress-line"[^>]*><polyline points="[^"]*"><\/polyline><\/svg>/g)
  assert.equal(lines.length, 3)
  // Row 1: bar A (1–3 h, 50%) kinks the line to its progress point at 2 h; the other rows keep it straight.
  assert.match(lines[1], /points="25,0 25,7 20,33 25,59 25,66"/)
  assert.match(lines[0], /points="25,0 25,66"/)
  assert.match(lines[0], /aria-hidden="true"/)
  const statusOnly = await render({ statusDate: 2.5 * hour })
  assert.match(statusOnly, /vw-gantt-status-date/)
  assert.doesNotMatch(statusOnly, /vw-gantt-progress-line/)
  const rtl = await render({ dir: 'rtl', statusDate: 2.5 * hour, showProgressLine: true })
  assert.match(rtl, /class="vw-gantt-marker vw-gantt-status-date"[^>]*style="right:calc\(var\(--vw-label-area-width\) \+ 25px\);"/)
  assert.match(rtl, /<svg class="vw-gantt-progress-line"[^>]*style="right:calc/)
  // Outside the range nothing is drawn.
  assert.doesNotMatch(await render({ statusDate: 20 * hour, showProgressLine: true }), /vw-gantt-status-date/)
})

test('GanttChart reports an invalid statusDate through validation-error', async () => {
  for (const statusDate of [Number.NaN, Infinity, '5']) {
    const reported = []
    const app = createSSRApp({ render: () => h(GanttChart, { ...chartProps, statusDate, onValidationError: error => reported.push(error) }) })
    app.config.errorHandler = () => {}
    const html = await renderToString(app)
    assert.equal(reported.length, 1)
    assert.ok(reported[0] instanceof RangeError)
    assert.match(reported[0].message, /statusDate/)
    assert.match(html, /No rows to display/)
  }
})

test('renderTimelineSvg draws the status date and the progress line only when asked', () => {
  const scale = createTimeScale({ start: 0, end: 10 * hour }, 10 / hour)
  const plain = renderTimelineSvg(chartRows, chartBars, [], scale)
  assert.equal(renderTimelineSvg(chartRows, chartBars, [], scale, { showProgressLine: true }), plain)
  const svg = renderTimelineSvg(chartRows, chartBars, [], scale, {
    statusDate: 2.5 * hour, showProgressLine: true, statusDateLabel: 'Stichtag', theme: { status: '#123456' },
  })
  assert.match(svg, /<g class="vw-gantt-status-date"><title>Stichtag 02:30<\/title><line x1="179" y1="40" x2="179" y2="238" stroke="#123456" stroke-width="2"\/>/)
  assert.match(svg, /<polyline class="vw-gantt-progress-line" fill="none" stroke="#123456" stroke-width="2" stroke-linejoin="round" points="179,40 179,113 174,139 179,165 179,238"\/>/)
  const rtl = renderTimelineSvg(chartRows, chartBars, [], scale, { statusDate: 2.5 * hour, direction: 'rtl' })
  assert.match(rtl, /<g class="vw-gantt-status-date"><title>Status date 02:30<\/title><line x1="75"/)
  assert.doesNotMatch(rtl, /vw-gantt-progress-line/)
  assert.throws(() => renderTimelineSvg(chartRows, chartBars, [], scale, { statusDate: Number.NaN }), RangeError)
})
