import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createSSRApp, h } from 'vue'
import { renderToString } from 'vue/server-renderer'
import { assignLanes, propagateEdit, scheduleTasks, validateTimelineData } from 'vue-weave/core'
import { GanttChart } from 'vue-weave'
import { renderComponent } from './helpers/ssr.mjs'

const lanesOf = result => result.bars.map(bar => [bar.id, bar.lane])
const bar = (id, start, end, extra = {}) => ({ id, rowId: 'r', label: id, start, end, ...extra })

test('assignLanes stacks overlapping bars first-fit in start order and lets touching bars share a lane', () => {
  const result = assignLanes([bar('a', 0, 4), bar('b', 2, 6), bar('c', 5, 8), bar('d', 8, 10), bar('e', 3, 5)])
  // a and b overlap; e overlaps both; c starts after a ends; d touches c and reuses lane 0.
  assert.deepEqual(lanesOf(result), [['a', 0], ['b', 1], ['c', 0], ['d', 0], ['e', 2]])
  assert.equal(result.laneCount, 3)
  assert.deepEqual([...result.rowLaneCounts], [['r', 3]])
  assert.deepEqual(lanesOf(assignLanes([bar('a', 0, 2), bar('b', 2, 4), bar('c', 4, 6)])), [['a', 0], ['b', 0], ['c', 0]])
  // Start order, not input order, decides; equal starts keep input order.
  assert.deepEqual(lanesOf(assignLanes([bar('late', 5, 9), bar('early', 0, 6), bar('same', 0, 2)])), [['late', 1], ['early', 0], ['same', 1]])
})

test('assignLanes treats a milestone as a point inside half-open bars', () => {
  const result = assignLanes([
    bar('task', 2, 4), bar('at-end', 4, 4), bar('at-start', 2, 2), bar('inside', 3, 3), bar('twin', 3, 3), bar('before', 0, 2),
  ])
  // A milestone at a bar's end fits beside it; one at its start or inside it does not; two at one time conflict.
  assert.deepEqual(lanesOf(result), [['task', 0], ['at-end', 0], ['at-start', 1], ['inside', 1], ['twin', 2], ['before', 0]])
  assert.equal(result.laneCount, 3)
  assert.deepEqual(lanesOf(assignLanes([bar('m', 5, 5), bar('n', 5, 5), bar('o', 6, 6)])), [['m', 0], ['n', 1], ['o', 0]])
})

test('assignLanes keepLanes keeps stable lanes and moves only conflicting bars to the lowest free lane', () => {
  const result = assignLanes([
    bar('a', 0, 4, { lane: 1 }), bar('b', 0, 4, { lane: 0 }), bar('c', 1, 2, { lane: 0 }), bar('d', 6, 8, { lane: 3 }),
    bar('e', 6, 7, { lane: 3 }), bar('f', 4, 6),
  ], { keepLanes: true })
  // c conflicts with b (placed first), so it takes the lowest lane free of a and b. e conflicts with d and drops to 0.
  assert.deepEqual(lanesOf(result), [['a', 1], ['b', 0], ['c', 2], ['d', 3], ['e', 0], ['f', 0]])
  assert.equal(result.laneCount, 4)
  // A lane that is already free is kept, even when a lower one is free too.
  assert.deepEqual(lanesOf(assignLanes([bar('x', 0, 2, { lane: 2 })], { keepLanes: true })), [['x', 2]])
  assert.equal(assignLanes([bar('x', 0, 2, { lane: 2 })], { keepLanes: true }).laneCount, 3)
  // An overlapping bar appended later moves; the earlier bars keep their lanes.
  const before = [bar('p', 0, 4), bar('q', 6, 9)]
  const appended = assignLanes([...before, bar('new', 3, 7)], { keepLanes: true })
  assert.deepEqual(lanesOf(appended), [['p', 0], ['q', 0], ['new', 1]])
  // Without keepLanes, the lanes in the input are ignored.
  assert.deepEqual(lanesOf(assignLanes([bar('a', 0, 4, { lane: 1 })])), [['a', 0]])
})

test('assignLanes counts lanes per row, returns new bars and leaves the input unchanged', () => {
  const input = Object.freeze([
    Object.freeze({ id: 'a', rowId: 'one', label: 'A', start: 0, end: 4, lane: 1 }),
    Object.freeze({ id: 'b', rowId: 'two', label: 'B', start: 0, end: 4, tone: 'teal' }),
    Object.freeze({ id: 'c', rowId: 'one', label: 'C', start: 1, end: 3 }),
    Object.freeze({ id: 'd', rowId: 'two', label: 'D', start: 4, end: 6 }),
  ])
  const result = assignLanes(input)
  assert.deepEqual(lanesOf(result), [['a', 0], ['b', 0], ['c', 1], ['d', 0]])
  assert.deepEqual([...result.rowLaneCounts], [['one', 2], ['two', 1]])
  assert.equal(result.laneCount, 2)
  assert.deepEqual(result.bars[1], { ...input[1], lane: 0 })
  for (let i = 0; i < input.length; i++) assert.notEqual(result.bars[i], input[i])
  assert.equal(input[0].lane, 1)
  assert.equal('lane' in input[2], false)
  validateTimelineData([{ id: 'one', label: 'One' }, { id: 'two', label: 'Two' }], result.bars, [], result.laneCount)

  const empty = assignLanes([])
  assert.deepEqual(empty.bars, [])
  assert.equal(empty.laneCount, 1)
  assert.equal(empty.rowLaneCounts.size, 0)
})

test('assignLanes validates intervals and lanes', () => {
  assert.throws(() => assignLanes([bar('a', 4, 2)]), RangeError)
  assert.throws(() => assignLanes([bar('a', 0, Number.NaN)]), RangeError)
  assert.throws(() => assignLanes([bar('a', 0, 2, { lane: -1 })], { keepLanes: true }), { name: 'RangeError', message: /lane for bar: a/ })
  assert.throws(() => assignLanes([bar('a', 0, 2, { lane: 1.5 })]), RangeError)
})

// The plan of the scheduling guide: cut 0–4, inspection 5–7 after the break at 4, other 2–4.
const plan = {
  range: { start: 0, end: 30 }, quantum: 1,
  calendars: [{ id: 'shift', periods: [{ start: 0, end: 4 }, { start: 5, end: 9 }, { start: 24, end: 30 }] }],
  defaultCalendarId: 'shift',
  tasks: [{ id: 'cut', duration: 4 }, { id: 'inspect', duration: 2 }, { id: 'other', duration: 2, startNoEarlierThan: 2 }],
  dependencies: [{ id: 'cut-inspect', from: 'cut', to: 'inspect', type: 'FS' }],
}
const dates = result => result.schedule.tasks.map(task => [task.id, task.start, task.end])

test('propagateEdit pins the edited task and reports the downstream changes in input order', () => {
  const moved = propagateEdit(plan, { id: 'cut', start: 1 })
  assert.equal(moved.ok, true)
  // Cutting now works 1–4 and 5–6, so inspection follows at 6.
  assert.deepEqual(moved.changes, [
    { id: 'cut', before: { start: 0, end: 4 }, after: { start: 1, end: 6 } },
    { id: 'inspect', before: { start: 5, end: 7 }, after: { start: 6, end: 8 } },
  ])
  assert.deepEqual(dates(moved), [['cut', 1, 6], ['inspect', 6, 8], ['other', 2, 4]])
  assert.equal(moved.schedule.tasks[0].critical, true)

  // Moving a task to where it already is changes nothing.
  const same = propagateEdit(plan, { id: 'cut', start: 0 })
  assert.deepEqual(same.changes, [])
  const base = scheduleTasks(plan)
  assert.deepEqual(dates(same), base.tasks.map(task => [task.id, task.start, task.end]))
})

test('propagateEdit resizes through end by recomputing the working duration on the task calendar', () => {
  // [0, 7) holds 4 + 2 working units across the break.
  const longer = propagateEdit(plan, { id: 'cut', start: 0, end: 7 })
  assert.deepEqual(longer.changes, [
    { id: 'cut', before: { start: 0, end: 4 }, after: { start: 0, end: 7 } },
    { id: 'inspect', before: { start: 5, end: 7 }, after: { start: 7, end: 9 } },
  ])
  const shorter = propagateEdit(plan, { id: 'cut', start: 0, end: 2 })
  assert.deepEqual(dates(shorter), [['cut', 0, 2], ['inspect', 2, 4], ['other', 2, 4]])
  // Work after the closed gap counts only its working time: 5–9 and 24–25.
  const spanning = propagateEdit(plan, { id: 'other', start: 5, end: 25 })
  assert.deepEqual(spanning.changes, [{ id: 'other', before: { start: 2, end: 4 }, after: { start: 5, end: 25 } }])
  assert.deepEqual(spanning.schedule.tasks[2].work, [{ start: 5, end: 9 }, { start: 24, end: 25 }])
})

test('propagateEdit returns infeasible and cycle failures unchanged', () => {
  // A start in a break is not a working start, like fixedStart.
  assert.deepEqual(propagateEdit(plan, { id: 'cut', start: 4 }), {
    ok: false, code: 'infeasible', taskId: 'cut', constraints: ['fixedStart', 'calendar'], dependencyIds: [],
  })
  // The predecessor still binds, and so do the task's own bounds.
  assert.deepEqual(propagateEdit(plan, { id: 'inspect', start: 1 }), {
    ok: false, code: 'infeasible', taskId: 'inspect', constraints: ['fixedStart'], dependencyIds: ['cut-inspect'],
  })
  assert.deepEqual(propagateEdit(plan, { id: 'other', start: 0 }).constraints, ['startNoEarlierThan', 'fixedStart'])
  // An existing fixed start is replaced.
  const fixed = { ...plan, tasks: [...plan.tasks.slice(0, 2), { id: 'other', duration: 2, fixedStart: 2 }] }
  assert.deepEqual(propagateEdit(fixed, { id: 'other', start: 6 }).changes, [{ id: 'other', before: { start: 2, end: 4 }, after: { start: 6, end: 8 } }])

  const cyclic = { ...plan, dependencies: [...plan.dependencies, { id: 'back', from: 'inspect', to: 'cut' }] }
  const cycle = propagateEdit(cyclic, { id: 'cut', start: 1 })
  assert.deepEqual(cycle, scheduleTasks(cyclic))
  assert.equal(cycle.code, 'cycle')

  // When only the unedited plan fails, there is nothing to compare with: its failure is returned.
  const late = {
    range: { start: 0, end: 10 },
    tasks: [{ id: 'a', duration: 4 }, { id: 'b', duration: 2, finishNoLaterThan: 5 }],
    dependencies: [{ id: 'ab', from: 'a', to: 'b' }],
  }
  assert.equal(scheduleTasks(late).ok, false)
  assert.deepEqual(propagateEdit(late, { id: 'a', start: 0, end: 2 }), scheduleTasks(late))
})

test('propagateEdit validates the edit and never mutates its input', () => {
  assert.throws(() => propagateEdit(plan, { id: 'nope', start: 0 }), { name: 'Error', message: 'Unknown task: nope' })
  assert.throws(() => propagateEdit({ ...plan, quantum: 2 }, { id: 'cut', start: 1 }), RangeError)
  assert.throws(() => propagateEdit(plan, { id: 'cut', start: 0.5 }), RangeError)
  assert.throws(() => propagateEdit(plan, { id: 'cut', start: 3, end: 2 }), RangeError)
  assert.throws(() => propagateEdit(plan, { id: 'cut' }), RangeError)
  const frozen = Object.freeze({
    ...plan,
    tasks: Object.freeze(plan.tasks.map(task => Object.freeze({ ...task }))),
    dependencies: Object.freeze(plan.dependencies.map(link => Object.freeze({ ...link }))),
  })
  const result = propagateEdit(frozen, { id: 'cut', start: 1, end: 6 })
  assert.equal(result.ok, true)
  assert.deepEqual(frozen.tasks[0], { id: 'cut', duration: 4 })
})

const hour = 3_600_000
const rows = [{ id: 'p', label: 'Parent' }, { id: 'r1', label: 'Row 1', parentId: 'p' }, { id: 'r2', label: 'Row 2' }]
const bars = [
  { id: 'a', rowId: 'r1', label: 'A', start: hour, end: 3 * hour, editable: true },
  { id: 'b', rowId: 'r2', label: 'B', start: 4 * hour, end: 6 * hour },
]
const chartProps = { rows, bars, dependencies: [{ id: 'ab', from: 'a', to: 'b' }], range: { start: 0, end: 10 * hour }, pixelsPerUnit: 10 / hour }
const render = (props = {}) => renderComponent(GanttChart, { ...chartProps, ...props })

test('GanttChart server markup is unchanged without creatable and cascade', async () => {
  for (const extra of [{}, { connectable: true, reconnectable: true, selectedDependencyId: 'ab' }, { dir: 'rtl', progressEditable: true }]) {
    const plain = await render(extra)
    const disabled = await render({
      ...extra, creatable: false, createDuration: hour, validateCreate: () => false, cascade: () => [{ id: 'b', before: bars[1], after: bars[0], mode: 'move', source: 'pointer' }],
    })
    assert.equal(disabled, plain)
    assert.doesNotMatch(plain, /vw-creatable|vw-gantt-create|vw-gantt-cascade|Add bar to/)
  }
})

test('GanttChart renders an add button for each creatable row on the server', async () => {
  const html = await render({ creatable: row => row.id !== 'p', labels: { createIn: 'Balken hinzufügen zu' } })
  const buttons = html.match(/<button type="button" class="vw-gantt-create-button"[^>]*>/g)
  assert.deepEqual(buttons, [
    '<button type="button" class="vw-gantt-create-button" aria-label="Balken hinzufügen zu Row 1">',
    '<button type="button" class="vw-gantt-create-button" aria-label="Balken hinzufügen zu Row 2">',
  ])
  // The parent row keeps its expand toggle and gets no button; no preview exists before a gesture.
  assert.match(html, /aria-label="Collapse Parent">▾<\/button><div class="vw-row-content">/)
  assert.doesNotMatch(html, /vw-gantt-create-preview|vw-gantt-cascade-preview/)
  assert.equal((await render({ creatable: true })).match(/vw-gantt-create-button/g).length, 3)
  assert.doesNotMatch(await render({ creatable: true, readonly: true }), /vw-gantt-create-button/)
})

test('GanttChart reports an invalid createDuration through validation-error', async () => {
  for (const createDuration of [0, -hour, Number.NaN, Infinity]) {
    const reported = []
    const app = createSSRApp({ render: () => h(GanttChart, { ...chartProps, creatable: true, createDuration, onValidationError: error => reported.push(error) }) })
    app.config.errorHandler = () => {}
    const html = await renderToString(app)
    assert.equal(reported.length, 1)
    assert.ok(reported[0] instanceof RangeError)
    assert.match(reported[0].message, /createDuration/)
    assert.match(html, /No rows to display/)
  }
})
