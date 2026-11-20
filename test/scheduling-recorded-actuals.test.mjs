import assert from 'node:assert/strict'
import { test } from 'node:test'
import * as core from 'vue-weave/core'
import { sparseLink as link, task } from './helpers/builders.mjs'
import { attempt, seededRandom, sha256Json, withPlainTrace } from './helpers/seeded.mjs'
import { renderComponent } from './helpers/ssr.mjs'

// Seeded plans with calendars, every link type and lag, bounds, a deadline, pauses, manual and inactive tasks, summary
// tasks and progress entries, run through `rescheduleFromStatusDate`, `scheduleTasks` and `toPlanningDiagnostics`. The
// digest was produced before recorded actuals were added; it must not change, because progress-percentage input is
// scheduled exactly as before. (It was updated once, when the trace reasons of links into summary tasks began to name
// the leaf that binds; every date, rescheduled plan and diagnostic stayed the same.)
test('progress-percentage rescheduling gives the same results as before recorded actuals', () => {
  assert.equal(progressPlanDigest(), '39dc35e5f38ea5c2a86ed4d3f6df4df827a86d964e301e4fed76dff448721548')
})

const { actualsTimelineBars, rescheduleFromActuals, scheduleTasks, timelineBaselineId } = core
const range = { start: 0, end: 100 }
const byId = (result, id) => result.tasks.find(item => item.id === id)
const span = item => [item.start, item.end]
const codes = result => result.diagnostics.map(item => [item.code, item.entities.map(entity => entity.id).join(',')])
// a (4) → b (4) → c (2), continuous time: planned a [0, 4), b [4, 8), c [8, 10).
const chain = (fields = {}) => ({
  range, tasks: [task('a', 4, fields.a), task('b', 4, fields.b), task('c', 2, fields.c)], dependencies: [link('a', 'b'), link('b', 'c')],
})

test('a late start keeps the actual interval and schedules the rest from the status date', () => {
  const actuals = new Map([['a', { intervals: [{ start: 2, end: 4 }] }]])
  const result = rescheduleFromActuals(chain(), 4, actuals)
  assert.equal(result.ok, true)
  const a = byId(result, 'a')
  assert.deepEqual([a.state, a.actual, a.performedWork, a.remainingWork, a.remaining, span(a), a.plan],
    ['in-progress', [{ start: 2, end: 4 }], 2, 2, [{ start: 4, end: 6 }], [2, 6], { start: 0, end: 4 }])
  assert.deepEqual([span(byId(result, 'b')), span(byId(result, 'c'))], [[6, 10], [10, 12]])
  assert.deepEqual(byId(result, 'b').plan, { start: 4, end: 8 })
  // The forecast schedule: a spans its actual start to its forecast finish and works in both parts.
  const scheduled = byId(result.schedule, 'a')
  assert.deepEqual([span(scheduled), scheduled.work], [[2, 6], [{ start: 2, end: 4 }, { start: 4, end: 6 }]])
  assert.deepEqual(result.plan, scheduleTasks(chain()))
  assert.equal(result.schedule.finish, 12)
  assert.deepEqual(result.diagnostics, [])
  assert.equal(result.statusDate, 4)
})

test('an interruption and resume are kept as two actual intervals', () => {
  const intervals = [{ start: 0, end: 1 }, { start: 3, end: 4 }]
  const result = rescheduleFromActuals(chain(), 5, new Map([['a', { intervals }]]))
  const a = byId(result, 'a')
  assert.deepEqual([a.actual, a.performedWork, a.remaining, span(a)], [intervals, 2, [{ start: 5, end: 7 }], [0, 7]])
  assert.deepEqual(byId(result.schedule, 'a').work, [...intervals, { start: 5, end: 7 }])
  assert.deepEqual(span(byId(result, 'b')), [7, 11])
  // Actuals are reported in input order, with the recorded values.
  const reversed = rescheduleFromActuals(chain(), 5, new Map([['a', { intervals: [...intervals].reverse() }]]))
  assert.deepEqual(byId(reversed, 'a').actual, [...intervals].reverse())
  assert.deepEqual(byId(reversed.schedule, 'a').work, byId(result.schedule, 'a').work)
})

test('a finished task ends at its last actual end, also when it overran, and ignores its predecessors', () => {
  const result = rescheduleFromActuals(chain(), 7, new Map([['a', { intervals: [{ start: 1, end: 6 }], finished: true }]]))
  const a = byId(result, 'a')
  assert.deepEqual([a.state, a.remainingWork, a.remaining, span(a)], ['finished', 0, [], [1, 6]])
  const scheduled = byId(result.schedule, 'a')
  assert.deepEqual([scheduled.work, scheduled.latestStart, scheduled.latestEnd, scheduled.totalFloat, scheduled.critical, scheduled.manual],
    [[{ start: 1, end: 6 }], 1, 6, 0, false, undefined])
  // b has not started, so it waits for the status date.
  assert.deepEqual(span(byId(result, 'b')), [7, 11])
  // Without remaining work, a task is finished even without the flag; b finished too, although a's link would hold it.
  const both = rescheduleFromActuals(chain(), 9, new Map([['a', { intervals: [{ start: 0, end: 4 }] }], ['b', { intervals: [{ start: 2, end: 6 }] }]]))
  assert.deepEqual(['a', 'b', 'c'].map(id => [byId(both, id).state, ...span(byId(both, id))]),
    [['finished', 0, 4], ['finished', 2, 6], ['not-started', 9, 11]])
  assert.deepEqual(both.schedule.manualConflicts, undefined)
})

test('remaining work revised upward replaces the default rule', () => {
  const actuals = new Map([['a', { intervals: [{ start: 0, end: 3 }], remainingWork: 5 }]])
  const result = rescheduleFromActuals(chain(), 3, actuals)
  const a = byId(result, 'a')
  assert.deepEqual([a.performedWork, a.remainingWork, a.remaining, span(a)], [3, 5, [{ start: 3, end: 8 }], [0, 8]])
  assert.deepEqual([span(byId(result, 'b')), span(byId(result, 'c'))], [[8, 12], [12, 14]])
  // remainingWork 0 finishes a task; on an unstarted task it replaces the duration.
  const zero = rescheduleFromActuals(chain(), 3, new Map([['a', { intervals: [{ start: 0, end: 3 }], remainingWork: 0 }], ['c', { intervals: [], remainingWork: 6 }]]))
  assert.deepEqual([byId(zero, 'a').state, span(byId(zero, 'b')), span(byId(zero, 'c'))], ['finished', [3, 7], [7, 13]])
})

test('successor forecasts change while every actual interval stays bit for bit as recorded', () => {
  const intervals = [{ start: 0, end: 1 }, { start: 2, end: 3 }]
  const actuals = new Map([['a', { intervals }]])
  const input = chain()
  const before = JSON.stringify([input, [...actuals]])
  const ends = []
  for (const remainingWork of [1, 3, 8]) {
    const result = rescheduleFromActuals(input, 4, new Map([...actuals, ['a', { intervals, remainingWork }]]))
    assert.deepEqual(byId(result, 'a').actual, intervals)
    assert.notEqual(byId(result, 'a').actual[0], intervals[0])
    for (const [id, recorded] of actuals) {
      byId(result, id).actual.forEach((part, index) => {
        assert.ok(Object.is(part.start, recorded.intervals[index].start) && Object.is(part.end, recorded.intervals[index].end))
      })
      const work = byId(result.schedule, id).work
      for (const part of recorded.intervals) assert.ok(work.some(item => item.start === part.start && item.end === part.end))
    }
    ends.push(byId(result, 'c').end)
  }
  assert.deepEqual(ends, [11, 13, 18])
  assert.equal(JSON.stringify([input, [...actuals]]), before)
})

test('remaining work that cannot meet a bound keeps the actuals and returns diagnostics', () => {
  const input = chain({ b: { finishNoLaterThan: 9 } })
  const actuals = new Map([['a', { intervals: [{ start: 0, end: 2 }], remainingWork: 4 }]])
  const result = rescheduleFromActuals(input, 3, actuals)
  assert.equal(result.ok, false)
  assert.deepEqual(result.schedule, { ok: false, code: 'infeasible', taskId: 'b', constraints: ['finishNoLaterThan'], dependencyIds: ['a-b'] })
  assert.deepEqual(codes(result), [['schedule-infeasible', 'b,a-b']])
  const a = byId(result, 'a')
  assert.deepEqual([a.actual, a.remaining, span(a), a.plan], [[{ start: 0, end: 2 }], [], [0, 2], { start: 0, end: 4 }])
  assert.deepEqual([byId(result, 'b').start, byId(result, 'b').plan], [undefined, { start: 4, end: 8 }])
  assert.deepEqual(actualsTimelineBars(result).map(bar => bar.label), ['a · actual'])
  // A deadline the forecast misses, and a finished task after the deadline.
  const late = rescheduleFromActuals({ ...chain(), deadline: 10 }, 3, actuals)
  assert.deepEqual([late.schedule.taskId, late.schedule.constraints], ['b', ['deadline']])
  const done = rescheduleFromActuals({ ...chain(), deadline: 10 }, 20, new Map([['a', { intervals: [{ start: 0, end: 12 }], finished: true }]]))
  assert.deepEqual([done.schedule.taskId, done.schedule.constraints, byId(done, 'a').actual], ['a', ['deadline'], [{ start: 0, end: 12 }]])
})

test('actuals on non-working time are kept and flagged against the task calendar', () => {
  // Working time [0, 10) and [20, 30) and so on; [10, 20) is closed. b works on its own calendar after a pause.
  const periods = [0, 20, 40, 60, 80].map(start => ({ start, end: start + 10 }))
  const input = {
    range, calendars: [{ id: 'w', periods }], defaultCalendarId: 'w',
    tasks: [task('a', 6), task('b', 4, { pauses: [{ start: 2, end: 4 }] })], dependencies: [link('a', 'b')],
  }
  const actuals = new Map([['a', { intervals: [{ start: 8, end: 14 }] }], ['b', { intervals: [{ start: 3, end: 4 }] }]])
  const result = rescheduleFromActuals(input, 16, actuals)
  const a = byId(result, 'a')
  assert.deepEqual([a.actual, a.offCalendar, a.performedWork, a.remaining], [[{ start: 8, end: 14 }], [{ start: 10, end: 14 }], 6, []])
  assert.deepEqual([a.state, span(a)], ['finished', [8, 14]])
  assert.deepEqual(byId(result, 'b').offCalendar, [{ start: 3, end: 4 }])
  // b resumes at the next working time after the status date.
  assert.deepEqual(byId(result, 'b').remaining, [{ start: 20, end: 23 }])
  assert.deepEqual(result.diagnostics.map(item => [item.code, item.severity, item.entities[0].id, item.range]), [
    ['actual-outside-calendar', 'warning', 'a', { start: 10, end: 14 }],
    ['actual-outside-calendar', 'warning', 'b', { start: 3, end: 4 }],
  ])
  assert.equal(result.diagnostics[0].id, JSON.stringify(['actual-outside-calendar', 'a', 10, 14]))
})

test('overlaps, actuals after the status date and contradictions are diagnostics that name the task', () => {
  const actuals = new Map([
    ['a', { intervals: [{ start: 0, end: 3 }, { start: 2, end: 4 }], finished: true, remainingWork: 2 }],
    ['b', { intervals: [{ start: 4, end: 9 }] }],
  ])
  const result = rescheduleFromActuals(chain(), 6, actuals)
  assert.deepEqual(result.diagnostics.map(item => [item.code, item.severity, item.entities[0].id, item.range]), [
    ['actual-contradiction', 'error', 'a', undefined],
    ['actual-overlap', 'error', 'a', { start: 2, end: 3 }],
    ['actual-after-status-date', 'warning', 'b', { start: 6, end: 9 }],
  ])
  // Overlaps count once; the explicit remaining work of the contradictory entry is scheduled.
  const a = byId(result, 'a')
  assert.deepEqual([a.performedWork, a.state, a.remaining], [4, 'in-progress', [{ start: 6, end: 8 }]])
  // b ran past the status date: its remaining work starts after its last actual end. 5 of 4 units are done.
  assert.deepEqual([byId(result, 'b').state, span(byId(result, 'b'))], ['finished', [4, 9]])
  const open = rescheduleFromActuals(chain(), 6, new Map([['b', { intervals: [{ start: 4, end: 7 }], remainingWork: 2 }]]))
  assert.deepEqual(byId(open, 'b').remaining, [{ start: 7, end: 9 }])
  assert.deepEqual(result.diagnostics.every(item => Array.isArray(item.reasonIds) && item.reasonIds.length === 0), true)
})

test('malformed actuals throw descriptive errors that name the task', () => {
  const input = { ...chain(), quantum: 2 }
  const call = (actuals, status = 4) => () => rescheduleFromActuals(input, status, actuals)
  const entry = intervals => new Map([['a', { intervals }]])
  for (const status of [Number.NaN, Infinity, -2, 102, 3]) assert.throws(call(new Map(), status), RangeError)
  assert.throws(call({ a: { intervals: [] } }), { name: 'Error', message: /Actuals must be a Map/ })
  assert.throws(call(new Map([['zz', { intervals: [] }]])), { name: 'Error', message: 'Unknown task in actuals: zz' })
  assert.throws(call(new Map([['a', {}]])), { name: 'Error', message: 'Actuals need an intervals array: a' })
  assert.throws(call(entry([null])), { name: 'Error', message: 'Invalid actual interval: a' })
  assert.throws(call(entry([{ start: 0, end: Number.NaN }])), { name: 'RangeError', message: 'Scheduling dates must align with the horizon and quantum (actual interval of task a)' })
  assert.throws(call(entry([{ start: 0, end: Infinity }])), { name: 'RangeError', message: 'Scheduling dates must align with the horizon and quantum (actual interval of task a)' })
  assert.throws(call(entry([{ start: 4, end: 2 }])), { name: 'RangeError', message: 'Working periods must have finite integer endpoints and positive length (actual interval of task a)' })
  assert.throws(call(entry([{ start: 2, end: 2 }])), { name: 'RangeError', message: 'Working periods must have finite integer endpoints and positive length (actual interval of task a)' })
  assert.throws(call(entry([{ start: 1, end: 2 }])), { name: 'RangeError', message: 'Scheduling dates must align with the horizon and quantum (actual interval of task a)' })
  assert.throws(call(entry([{ start: -2, end: 2 }])), { name: 'RangeError', message: 'Scheduling dates must lie inside the schedule range (actual interval of task a)' })
  for (const remainingWork of [-2, 1, 1.5, Number.NaN]) {
    assert.throws(call(new Map([['a', { intervals: [], remainingWork }]])), { name: 'RangeError', message: /Remaining work .*: a$/ })
  }
  assert.throws(call(new Map([['a', { intervals: [], finished: 'yes' }]])), { name: 'Error', message: 'Invalid finished flag: a' })
  assert.throws(call(new Map([['a', { intervals: [], finished: true }]])), { name: 'Error', message: 'A finished task needs at least one actual interval: a' })
})

test('started tasks drop start links and keep finish links, and successors use the actual start', () => {
  // x (6) →FS→ a and x →FF→ b; a and b are in progress at status date 2 while x has not started.
  const input = {
    range, tasks: [task('x', 6), task('a', 4), task('b', 4), task('s', 1), task('f', 1)],
    dependencies: [link('x', 'a'), link('x', 'b', 'FF'), link('a', 's', 'SS', 1), link('a', 'f', 'FF')],
  }
  const actuals = new Map([['a', { intervals: [{ start: 0, end: 2 }] }], ['b', { intervals: [{ start: 0, end: 2 }] }]])
  const result = rescheduleFromActuals(input, 2, actuals)
  // x now runs [2, 8). a ignores the FS link: it resumes at the status date. b must finish with x: its rest waits.
  assert.deepEqual(['x', 'a', 'b', 's', 'f'].map(id => span(byId(result, id))), [[2, 8], [0, 4], [0, 8], [2, 3], [3, 4]])
  assert.deepEqual(byId(result, 'b').remaining, [{ start: 6, end: 8 }])
  // The SS successor follows a's actual start 0 (plus lag 1), held only by the status date.
  const earlier = rescheduleFromActuals({ ...input, dependencies: [link('a', 's', 'SS', 3)] }, 2, actuals)
  assert.deepEqual(span(byId(earlier, 's')), [3, 4])
  assert.deepEqual(result.schedule.tasks.map(item => item.id), ['x', 'a', 'b', 's', 'f'])
})

test('summary tasks roll up the actual and forecast dates of their subtasks', () => {
  const input = {
    range,
    tasks: [task('x', 3), task('S', 0, { startNoEarlierThan: 3 }), task('p', 2, { parentId: 'S' }), task('q', 3, { parentId: 'S' }), task('y', 1)],
    dependencies: [link('x', 'S'), link('S', 'y')],
  }
  // Plan: x [0, 3), p [3, 5), q [3, 6), S [3, 6), y [6, 7). p ran early at [1, 2) and has 1 unit left.
  const result = rescheduleFromActuals(input, 4, new Map([['p', { intervals: [{ start: 1, end: 2 }] }]]))
  assert.deepEqual(['x', 'S', 'p', 'q', 'y'].map(id => span(byId(result, id))), [[4, 7], [1, 10], [1, 5], [7, 10], [10, 11]])
  const summary = byId(result, 'S')
  assert.deepEqual([summary.summary, summary.state, summary.performedWork, summary.remainingWork, summary.actual, summary.plan],
    [true, 'in-progress', 1, 4, [], { start: 3, end: 6 }])
  assert.deepEqual(span(byId(result.schedule, 'S')), [1, 10])
  assert.equal(byId(result, 'p').parentId, 'S')
  // The SS link from S follows its rolled-up start, the actual start of p.
  const ss = rescheduleFromActuals({ ...input, dependencies: [link('S', 'y', 'SS', 5)] }, 4, new Map([['p', { intervals: [{ start: 1, end: 2 }] }]]))
  assert.deepEqual(span(byId(ss, 'y')), [6, 7])
  assert.throws(() => rescheduleFromActuals(input, 4, new Map([['S', { intervals: [] }]])), /Summary task S cannot have actuals/)
  // A failed forecast still gives the summary the span of its subtasks' actuals.
  const failed = rescheduleFromActuals({ ...input, deadline: 6 }, 4, new Map([['p', { intervals: [{ start: 1, end: 2 }] }]]))
  assert.deepEqual([failed.ok, span(byId(failed, 'S'))], [false, [1, 2]])
})

test('manual tasks keep their dates and conflicts, inactive tasks are ignored', () => {
  const input = {
    range, tasks: [task('a', 4), task('m', 0, { manual: { start: 3, end: 5 } }), task('z', 2, { inactive: true }), task('n', 2)],
    dependencies: [link('a', 'm'), link('z', 'n'), link('m', 'n')],
  }
  const actuals = new Map([['m', { intervals: [{ start: 4, end: 5 }] }], ['z', { intervals: [{ start: 0, end: 1 }] }], ['a', { intervals: [{ start: 1, end: 2 }] }]])
  const result = rescheduleFromActuals(input, 2, actuals)
  const m = byId(result, 'm')
  assert.deepEqual([m.manual, m.state, m.actual, m.remaining, m.remainingWork, span(m)], [true, 'in-progress', [{ start: 4, end: 5 }], [], 0, [3, 5]])
  assert.deepEqual(result.schedule.manualConflicts, [{ taskId: 'm', dependencyId: 'a-m' }])
  assert.deepEqual(codes(result), [['actual-after-status-date', 'm'], ['manual-conflict', 'm,a-m']])
  assert.equal(byId(result, 'z'), undefined)
  assert.deepEqual(result.schedule.inactiveTaskIds, ['z'])
  assert.deepEqual(span(byId(result, 'n')), [5, 7])
  const finished = rescheduleFromActuals(input, 5, new Map([['m', { intervals: [{ start: 3, end: 5 }], finished: true }]]))
  assert.equal(byId(finished, 'm').state, 'finished')
})

test('a 12,000-task chain with actuals is rescheduled without recursion', () => {
  const count = 12000
  const tasks = [], dependencies = []
  for (let i = 0; i < count; i++) {
    tasks.push(task('c' + i, 1))
    if (i) dependencies.push(link('c' + (i - 1), 'c' + i))
  }
  const input = { range: { start: 0, end: count + 20 }, tasks, dependencies }
  const actuals = new Map([['c0', { intervals: [{ start: 0, end: 3 }], finished: true }], ['c1', { intervals: [{ start: 3, end: 4 }], remainingWork: 2 }]])
  const result = rescheduleFromActuals(input, 4, actuals)
  assert.equal(result.ok, true)
  assert.deepEqual([span(byId(result, 'c1')), span(byId(result, 'c11999'))], [[3, 6], [count + 3, count + 4]])
  assert.equal(actualsTimelineBars(result).length, count + 1)
})

test('actualsTimelineBars shows the plan, the actuals and the forecast on one row', () => {
  const actuals = new Map([['a', { intervals: [{ start: 0, end: 1 }, { start: 3, end: 4 }, { start: 3, end: 3.5 * 2 - 3 }] }], ['b', { intervals: [{ start: 4, end: 5 }], finished: true }]])
  const result = rescheduleFromActuals(chain(), 5, actuals)
  const bars = actualsTimelineBars(result, { label: id => id.toUpperCase() })
  assert.deepEqual(bars, [
    {
      id: 'a:actual', rowId: 'a', label: 'A · actual', start: 0, end: 4, tone: 'teal', appearance: 'solid', description: 'Recorded actual work',
      segments: [{ start: 0, end: 1 }, { start: 3, end: 4 }], baseline: { start: 0, end: 4 },
    },
    {
      id: 'a:forecast', rowId: 'a', label: 'A · forecast', start: 5, end: 7, tone: 'blue', appearance: 'outline', description: 'Remaining work forecast',
    },
    {
      id: 'b:actual', rowId: 'b', label: 'B · actual', start: 4, end: 5, tone: 'teal', appearance: 'solid', description: 'Recorded actual work',
      baseline: { start: 4, end: 8 },
    },
    {
      id: 'c:forecast', rowId: 'c', label: 'C · forecast', start: 5, end: 7, tone: 'blue', appearance: 'outline', description: 'Remaining work forecast',
      baseline: { start: 8, end: 10 },
    },
  ])
  const named = actualsTimelineBars(result, {
    baselineId: 'plan', rowId: id => 'row-' + id, barId: (id, part) => part[0] + id, partLabels: { actual: 'done', forecast: 'to do' },
    descriptions: { actual: 'Done', forecast: 'To do' }, tones: { actual: 'violet', forecast: 'amber' },
  })
  assert.deepEqual([named[0].id, named[0].rowId, named[0].label, named[0].tone, named[0].description, named[0].baselines, named[0].baseline],
    ['aa', 'row-a', 'a · done', 'violet', 'Done', [{ id: 'plan', start: 0, end: 4 }], undefined])
  assert.equal(named[1].label, 'a · to do')
  assert.equal(actualsTimelineBars(result, { baselineId: false }).some(bar => bar.baseline || bar.baselines), false)
  assert.equal(timelineBaselineId, '$baseline')
  assert.throws(() => actualsTimelineBars(undefined), /Invalid rescheduleFromActuals result/)
})

test('actualsTimelineBars renders on the server with accessible names for each part', async () => {
  const { GanttChart } = await import('vue-weave')
  const result = rescheduleFromActuals(chain(), 5, new Map([['a', { intervals: [{ start: 0, end: 1 }, { start: 3, end: 4 }] }]]))
  const rows = ['a', 'b', 'c'].map(id => ({ id, label: 'Task ' + id }))
  const bars = actualsTimelineBars(result, { label: id => 'Task ' + id })
  const formatTime = time => String(time)
  const html = await renderComponent(GanttChart, { rows, bars, range: { start: 0, end: 20 }, formatTime })
  assert.match(html, /aria-label="Task a · actual 0–4"/)
  assert.match(html, /aria-label="Task a · forecast 5–7"/)
  assert.match(html, /aria-label="Task b · forecast 7–11"/)
  assert.match(html, /vw-is-outline/)
  assert.equal((html.match(/class="vw-gantt-baseline"/g) ?? []).length, 3)
  assert.match(html, /Recorded actual work/)
  assert.match(html, /Remaining work forecast/)
  // SVG export draws the same parts: a solid actual bar and an outline forecast bar, named in their titles.
  const svg = core.renderTimelineSvg(rows, bars, [], core.createTimeScale({ start: 0, end: 20 }, 10), { formatTime })
  assert.match(svg, /<title>Task a · actual 0–4/)
  assert.match(svg, /<title>Task a · forecast 5–7/)
})

test('random plans with actuals keep every actual and place remaining work after the status date', () => {
  const { pick } = seededRandom(7)
  let succeeded = 0
  for (let plan = 0; plan < 300; plan++) {
    const periods = []
    for (let t = 0; t < 200; t += 10) if (pick(6)) periods.push({ start: t, end: t + 5 + pick(4) })
    const count = 3 + pick(8)
    const tasks = [task('S', 0)]
    for (let i = 0; i < count; i++) {
      const item = task('t' + i, 1 + pick(6))
      if (pick(3) === 0) item.parentId = 'S'
      if (pick(10) === 0) item.manual = { start: pick(10), end: 10 + pick(10) }
      if (pick(12) === 0) item.inactive = true
      if (pick(8) === 0) item.finishNoLaterThan = 40 + pick(80)
      if (pick(8) === 0) item.pauses = [{ start: pick(20), end: 20 + pick(5) }]
      tasks.push(item)
    }
    if (!tasks.some(item => item.parentId === 'S')) tasks[1].parentId = 'S'
    const dependencies = []
    for (let i = 0; i < count; i++) {
      for (let j = i + 1; j < count; j++) {
        if (pick(4)) continue
        const type = ['FS', 'SS', 'FF', 'SF'][pick(4)]
        dependencies.push({ id: 'l' + i + '-' + j, from: 't' + i, to: 't' + j, type, lag: pick(5) - 2 })
      }
    }
    const outside = tasks.slice(1).find(item => item.parentId === undefined)
    if (outside && pick(3) === 0) dependencies.push({ id: 'into-S', from: outside.id, to: 'S' })
    const input = { range: { start: 0, end: 200 }, calendars: [{ id: 'w', periods }], tasks, dependencies }
    if (pick(2)) input.defaultCalendarId = 'w'
    const statusDate = 5 + pick(30)
    const actuals = new Map()
    for (const item of tasks.slice(1)) {
      if (pick(2)) continue
      const intervals = []
      let at = pick(10)
      for (let k = pick(3) + 1; k > 0; k--) {
        const end = at + 1 + pick(5)
        intervals.push({ start: at, end })
        at = end + pick(4) - 1
      }
      const entry = { intervals }
      if (pick(4) === 0) entry.finished = true
      if (pick(4) === 0) entry.remainingWork = pick(6)
      actuals.set(item.id, entry)
    }
    const before = JSON.stringify([input, [...actuals]])
    const result = rescheduleFromActuals(input, statusDate, actuals)
    assert.equal(JSON.stringify([input, [...actuals]]), before)
    for (const [id, entry] of actuals) {
      const item = byId(result, id)
      if (!item) continue
      assert.deepEqual(item.actual, entry.intervals)
      const last = Math.max(...entry.intervals.map(part => part.end))
      for (const part of item.remaining) assert.ok(part.start >= Math.max(statusDate, last), JSON.stringify([plan, id]))
      if (result.ok && !item.manual) {
        assert.equal(item.start, Math.min(...entry.intervals.map(part => part.start)))
        assert.ok(item.end >= last)
      }
    }
    if (result.ok) {
      succeeded++
      const summary = byId(result, 'S')
      if (summary) {
        const children = result.tasks.filter(item => item.parentId === 'S')
        assert.deepEqual(span(summary), [Math.min(...children.map(item => item.start)), Math.max(...children.map(item => item.end))])
      }
      assert.deepEqual(result.schedule.tasks.map(item => item.id), result.tasks.map(item => item.id))
      for (const item of result.tasks) if (!item.summary) assert.equal(item.state === 'finished', item.remainingWork === 0 && item.actual.length > 0 && (!item.manual || item.state === 'finished'))
      actualsTimelineBars(result)
    } else {
      assert.ok(result.diagnostics.some(item => item.code.startsWith('schedule-')))
    }
  }
  assert.ok(succeeded > 100, String(succeeded))
})

function progressPlanDigest() {
  const { pick } = seededRandom(20261119)
  const run = fn => attempt(fn, error => error.name + ': ' + error.message)
  const outputs = []
  for (let plan = 0; plan < 200; plan++) {
    const quantum = pick(2) + 1
    const range = { start: 0, end: 160 * quantum }
    const periods = []
    for (let t = 0; t < range.end; t += 10 * quantum) {
      if (pick(7) === 0) continue
      periods.push({ start: t, end: t + (5 + pick(4)) * quantum })
    }
    const calendars = pick(3) ? { calendars: [{ id: 'c', periods }, { id: 'd', periods: [{ start: 0, end: range.end }] }], defaultCalendarId: 'c' } : {}
    const count = 3 + pick(9)
    const tasks = []
    const summaries = []
    for (let i = 0; i < count; i++) {
      const task = { id: 't' + i, duration: pick(6) * quantum }
      const roll = pick(16)
      if (roll === 0) task.startNoEarlierThan = pick(20) * quantum
      if (roll === 1) task.finishNoLaterThan = (30 + pick(60)) * quantum
      if (roll === 2) task.mode = 'alap'
      if (roll === 3) task.manual = { start: pick(10) * quantum, end: (10 + pick(10)) * quantum }
      if (roll === 4) task.inactive = true
      if (roll === 5) task.pauses = [{ start: pick(10) * quantum, end: (10 + pick(4)) * quantum }]
      if (roll === 6) task.fixedStart = pick(15) * quantum
      if (roll === 7) task.startNoLaterThan = (10 + pick(30)) * quantum
      if (roll === 8) task.finishNoEarlierThan = pick(40) * quantum
      if (roll === 9 && calendars.calendars) task.calendarId = 'd'
      if (roll === 10 && i > 0 && summaries.length) task.parentId = summaries[pick(summaries.length)]
      if (roll === 11) {
        // A summary with a few subtasks that follow it in input order.
        const summary = { id: 't' + i, duration: 0 }
        if (pick(3) === 0) summary.startNoEarlierThan = pick(10) * quantum
        if (pick(4) === 0) summary.finishNoLaterThan = (50 + pick(50)) * quantum
        tasks.push(summary)
        summaries.push(summary.id)
        continue
      }
      tasks.push(task)
    }
    // Summaries without subtasks become ordinary tasks; give each one at least one subtask.
    for (const id of summaries) {
      const index = tasks.findIndex(item => item.id === id)
      const later = tasks.slice(index + 1).filter(item => !summaries.includes(item.id) && item.parentId === undefined)
      if (later.length) later[0].parentId = id
      for (let k = 1; k < later.length; k++) if (pick(2)) later[k].parentId = id
    }
    const isSummary = id => tasks.some(item => item.parentId === id)
    const dependencies = []
    for (let i = 0; i < count; i++) {
      for (let j = i + 1; j < count; j++) {
        if (pick(4)) continue
        const from = tasks[i], to = tasks[j]
        let type = ['FS', 'SS', 'FF', 'SF'][pick(4)]
        if (isSummary(to.id) && type[1] === 'F') type = 'FS'
        const related = (a, b) => {
          for (let id = b.parentId; id !== undefined; id = tasks.find(item => item.id === id)?.parentId) if (id === a.id) return true
          return false
        }
        if (related(from, to) || related(to, from)) continue
        dependencies.push({ id: 'l' + i + '-' + j, from: from.id, to: to.id, type, lag: (pick(5) - 2) * quantum })
      }
    }
    if (plan % 31 === 9) dependencies.push({ id: 'back', from: 't' + (count - 1), to: 't0' })
    const input = { range, quantum, ...calendars, tasks, dependencies }
    if (pick(5) === 0) input.deadline = (60 + pick(80)) * quantum
    const schedule = run(() => core.scheduleTasks(input, { explain: true }))
    const progress = new Map(tasks.filter(() => pick(2)).map(task => [task.id, [0, 0.25, 0.5, 0.75, 1, 0.3, 0.999][pick(7)]]))
    const status = (pick(30)) * quantum
    const rescheduled = run(() => core.rescheduleFromStatusDate(input, status, progress))
    const diagnostics = run(() => core.toPlanningDiagnostics(schedule))
    const statusDiagnostics = run(() => core.toPlanningDiagnostics(rescheduled))
    outputs.push([withPlainTrace(schedule), rescheduled, diagnostics, statusDiagnostics])
  }
  return sha256Json(outputs)
}
