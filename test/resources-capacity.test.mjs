import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import {
  assignmentWorkPeriods, calculateResourceLoad, levelResources, parseWeaveSnapshot, projectResourceTimeline,
  proposeResourceAssignment, renderTimelineSvg, createTimeScale, scheduleTasks, toPlanningDiagnostics,
} from '@eightkk/vue-weave/core'
import { GanttChart } from '@eightkk/vue-weave'
import { seededRandom } from './helpers/seeded.mjs'
import { renderComponent } from './helpers/ssr.mjs'

const day = { start: 0, end: 24 }
const segments = (load, resourceId) => load.filter(item => !resourceId || item.resourceId === resourceId)
  .map(({ start, end, load: value, capacity, overload }) => [start, end, value, capacity, overload])
const work = (id, ...periods) => ({ id, work: periods.map(([start, end]) => ({ start, end })) })

// ---- step 1: capacity that changes over time ----

test('overload is measured against the capacity valid at each time', () => {
  // A task needs 3 units 13:00–15:00; capacity is 2 until 14:00 and 3 after.
  const load = calculateResourceLoad(day, [work('t', [13, 15])],
    [{ id: 'crew', capacity: 3, capacityPeriods: [{ start: 0, end: 14, capacity: 2 }] }],
    [{ resourceId: 'crew', taskId: 't', units: 3 }])
  assert.deepEqual(segments(load), [[0, 13, 0, 2, 0], [13, 14, 3, 2, 1], [14, 15, 3, 3, 0], [15, 24, 0, 3, 0]])
  assert.deepEqual(load.filter(item => item.overload).map(item => [item.start, item.end, item.overload, item.taskIds]), [[13, 14, 1, ['t']]])
})

test('downtime has capacity 0, idle time consumes nothing, and non-working time stays 0 whatever the capacity periods say', () => {
  const resource = {
    id: 'm', capacity: 2, periods: [{ start: 0, end: 12 }, { start: 13, end: 24 }],
    // Downtime 4–6, a boost 10–15 that crosses the lunch break, and an adjacent period 15–16.
    capacityPeriods: [{ start: 10, end: 15, capacity: 4 }, { start: 4, end: 6, capacity: 0 }, { start: 15, end: 16, capacity: 1 }],
  }
  const load = calculateResourceLoad(day, [work('a', [3, 5]), work('b', [11, 14])], [resource],
    [{ resourceId: 'm', taskId: 'a' }, { resourceId: 'm', taskId: 'b', units: 3 }])
  assert.deepEqual(segments(load), [
    [0, 3, 0, 2, 0], [3, 4, 1, 2, 0], [4, 5, 1, 0, 1], [5, 6, 0, 0, 0], [6, 10, 0, 2, 0], [10, 11, 0, 4, 0],
    [11, 12, 3, 4, 0], [12, 13, 3, 0, 3], [13, 14, 3, 4, 0], [14, 15, 0, 4, 0], [15, 16, 0, 1, 0], [16, 24, 0, 2, 0],
  ])
  // A capacity period equal to the base capacity changes nothing, so it does not split a segment.
  const same = calculateResourceLoad(day, [], [{ id: 'm', capacity: 2, capacityPeriods: [{ start: 5, end: 9, capacity: 2 }] }], [])
  assert.deepEqual(segments(same), [[0, 24, 0, 2, 0]])
  // Capacity periods outside the range are clipped away; one reaching into it applies from the range start.
  const clipped = calculateResourceLoad({ start: 10, end: 20 }, [],
    [{ id: 'm', capacity: 1, capacityPeriods: [{ start: -5, end: 12, capacity: 3 }, { start: 30, end: 40, capacity: 9 }] }], [])
  assert.deepEqual(segments(clipped), [[10, 12, 0, 3, 0], [12, 20, 0, 1, 0]])
})

test('capacity periods are validated and the error names the resource', () => {
  const run = (capacityPeriods, extra = {}) => () => calculateResourceLoad(day, [], [{ id: 'press', capacity: 1, capacityPeriods, ...extra }], [])
  assert.throws(run([{ start: 0, end: 5, capacity: 1 }, { start: 4, end: 8, capacity: 2 }]), { name: 'RangeError', message: /press.*overlap/ })
  assert.throws(run([{ start: 4, end: 8, capacity: 2 }, { start: 0, end: 5, capacity: 1 }]), { name: 'RangeError', message: /press/ })
  assert.throws(run([{ start: 5, end: 5, capacity: 1 }]), { name: 'RangeError', message: /press/ })
  assert.throws(run([{ start: 6, end: 5, capacity: 1 }]), { name: 'RangeError', message: /press/ })
  assert.throws(run([{ start: 0.5, end: 5, capacity: 1 }]), RangeError)
  assert.throws(run([{ start: 0, end: 5, capacity: -1 }]), { name: 'RangeError', message: /press/ })
  assert.throws(run([{ start: 0, end: 5, capacity: 1.5 }]), RangeError)
  assert.throws(run([{ start: 0, end: 5, capacity: Number.NaN }]), RangeError)
  assert.throws(run([{ start: 0, end: 5 }]), RangeError)
  assert.throws(run({ start: 0, end: 5, capacity: 1 }), { name: 'Error', message: /press/ })
  assert.throws(run([null]), { name: 'Error', message: /press/ })
  // Adjacent periods are fine, and so is an empty list.
  assert.doesNotThrow(run([{ start: 0, end: 5, capacity: 1 }, { start: 5, end: 8, capacity: 2 }]))
  assert.doesNotThrow(run([]))
  // Leveling applies the same rules, and like `periods`, the dates must align with the quantum.
  const level = (capacityPeriods, quantum = 1) => () => levelResources({
    range: { start: 0, end: 24 }, quantum, tasks: [{ id: 't', duration: 2 }],
    resources: [{ id: 'press', capacity: 1, capacityPeriods }], assignments: [{ resourceId: 'press', taskId: 't' }],
  })
  assert.throws(level([{ start: 0, end: 5, capacity: 1 }, { start: 4, end: 8, capacity: 2 }]), { name: 'RangeError', message: /press/ })
  assert.throws(level([{ start: 0, end: 3, capacity: 1 }], 2), RangeError)
  assert.doesNotThrow(level([{ start: 0, end: 4, capacity: 1 }], 2))
})

test('the capacity line of GanttChart and the SVG export follow the capacity of each segment', async () => {
  const hour = 3_600_000
  const load = calculateResourceLoad({ start: 0, end: 8 * hour }, [work('t', [2 * hour, 6 * hour])],
    [{ id: 'crew', capacity: 4, capacityPeriods: [{ start: 0, end: 4 * hour, capacity: 2 }] }],
    [{ resourceId: 'crew', taskId: 't', units: 3 }])
  assert.deepEqual(segments(load).map(item => item.slice(2)), [[0, 2, 0], [3, 2, 1], [3, 4, 0], [0, 4, 0]])
  const html = await renderComponent(GanttChart, {
    rows: [{ id: 'r', label: 'Row' }], bars: [{ id: 't', rowId: 'r', label: 'Task', start: 2 * hour, end: 6 * hour }],
    range: { start: 0, end: 8 * hour }, pixelsPerUnit: 40 / hour, loadRows: [{ id: 'crew', label: 'Crew' }], loadSegments: load,
  })
  // The peak is 4, so a capacity of 2 sits at 50 % and a capacity of 4 at 100 %.
  const lines = [...html.matchAll(/class="vw-load-capacity" style="bottom:([\d.]+)%;?"/g)].map(match => Number(match[1]))
  assert.deepEqual(lines, [50, 50, 100, 100])
  assert.match(html, /load 3 \/ capacity 2, overloaded by 1/)
  assert.match(html, /load 3 \/ capacity 4"/)
  const svg = renderTimelineSvg([{ id: 'r', label: 'Row' }], [{ id: 't', rowId: 'r', label: 'Task', start: 2 * hour, end: 6 * hour }], [],
    createTimeScale({ start: 0, end: 8 * hour }, 40 / hour), { loadRows: [{ id: 'crew', label: 'Crew' }], loadSegments: load })
  assert.match(svg, /: 3 \/ 2</)
  assert.match(svg, /: 3 \/ 4</)
})

test('levelResources places work where the time-varying capacity allows it, and load then agrees', () => {
  // Capacity 1, raised to 2 from 10 to 20: a task needing 2 units waits for 10.
  const input = {
    range: { start: 0, end: 40 }, tasks: [{ id: 'big', duration: 5 }, { id: 'small', duration: 3 }],
    resources: [{ id: 'm', capacity: 1, capacityPeriods: [{ start: 10, end: 20, capacity: 2 }] }],
    assignments: [{ resourceId: 'm', taskId: 'big', units: 2 }, { resourceId: 'm', taskId: 'small' }],
  }
  const result = levelResources(input, { explain: true })
  assert.equal(result.ok, true)
  assert.deepEqual(result.tasks.map(task => [task.id, task.start, task.end]), [['big', 10, 15], ['small', 0, 3]])
  assert.deepEqual(result.unresolvedTaskIds, [])
  assert.deepEqual(result.overloads, [])
  const load = calculateResourceLoad(input.range, result.tasks, input.resources, input.assignments)
  assert.ok(load.every(segment => segment.overload === 0))
  // The trace names the capacity that was short before 10.
  const reason = result.trace.reasons.find(item => item.kind === 'capacity' && item.taskId === 'big')
  assert.deepEqual([reason.capacity, reason.range], [1, { start: 0, end: 10 }])
  // Downtime splits a splittable task around it and delays one that cannot be split.
  const downtime = { ...input, tasks: [{ id: 'a', duration: 6, splittable: true }, { id: 'b', duration: 6, startNoEarlierThan: 20 }],
    resources: [{ id: 'm', capacity: 1, capacityPeriods: [{ start: 2, end: 4, capacity: 0 }, { start: 22, end: 24, capacity: 0 }] }],
    assignments: [{ resourceId: 'm', taskId: 'a' }, { resourceId: 'm', taskId: 'b' }] }
  const split = levelResources(downtime)
  assert.deepEqual(split.tasks.map(task => [task.id, task.work.map(item => [item.start, item.end])]), [['a', [[0, 2], [4, 8]]], ['b', [[24, 30]]]])
  assert.deepEqual(split.overloads, [])
})

test('leveling keeps manual tasks, ignores inactive tasks and summaries, and agrees with the load calculation', () => {
  const input = {
    range: { start: 0, end: 40 },
    tasks: [
      { id: 'S', duration: 0 }, { id: 'x', duration: 4, parentId: 'S' }, { id: 'y', duration: 4, parentId: 'S' },
      { id: 'fixed', duration: 0, manual: { start: 2, end: 6 } }, { id: 'off', duration: 8, inactive: true },
    ],
    resources: [{ id: 'm', capacity: 1, capacityPeriods: [{ start: 0, end: 10, capacity: 2 }] }],
    assignments: [
      { resourceId: 'm', taskId: 'S', units: 5 }, { resourceId: 'm', taskId: 'x' }, { resourceId: 'm', taskId: 'y' },
      { resourceId: 'm', taskId: 'fixed' }, { resourceId: 'm', taskId: 'off', units: 9 },
    ],
  }
  const result = levelResources(input)
  const dates = new Map(result.tasks.map(task => [task.id, [task.start, task.end]]))
  assert.deepEqual(dates.get('fixed'), [2, 6])
  // x takes the second unit next to the manual task; y must wait until x is done (capacity 2 holds the manual task too).
  assert.deepEqual([dates.get('x'), dates.get('y')], [[0, 4], [4, 8]])
  assert.deepEqual(result.unresolvedTaskIds, [])
  assert.deepEqual(result.overloads, [])
  const load = calculateResourceLoad(input.range, result.tasks, input.resources, input.assignments, { inactiveTaskIds: result.inactiveTaskIds })
  assert.equal(Math.max(...load.map(segment => segment.load)), 2)
  // With 2 units, the manual task cannot fit once the capacity drops at 10: it stays, and both functions report the same
  // overload.
  const late = {
    ...input,
    tasks: input.tasks.map(task => task.id === 'fixed' ? { ...task, manual: { start: 8, end: 12 } } : task),
    assignments: input.assignments.map(item => item.taskId === 'fixed' ? { ...item, units: 2 } : item),
  }
  const stuck = levelResources(late)
  assert.deepEqual(stuck.tasks.find(task => task.id === 'fixed').start, 8)
  assert.deepEqual(stuck.unresolvedTaskIds, ['fixed'])
  const stuckLoad = calculateResourceLoad(late.range, stuck.tasks, late.resources, late.assignments, { inactiveTaskIds: stuck.inactiveTaskIds })
  assert.deepEqual(stuck.overloads.map(item => [item.start, item.end, item.overload]), [[10, 12, 1]])
  assert.deepEqual(stuck.overloads, stuckLoad.filter(segment => segment.overload > 0))
  assert.ok(stuck.overloads.every(segment => segment.taskIds.some(id => stuck.unresolvedTaskIds.includes(id))))
  const diagnostics = toPlanningDiagnostics(stuck)
  assert.ok(diagnostics.some(item => item.code === 'resource-overload'))
})

// Seeded plans with capacity periods and partial assignments: leveling and `calculateResourceLoad` must agree. Every
// remaining overload involves a task that leveling reports as unresolved, so a plan without unresolved tasks has none.
test('seeded plans: after leveling, every overload involves an unresolved task', () => {
  const { pick } = seededRandom(4242)
  let clean = 0, partials = 0
  for (let plan = 0; plan < 200; plan++) {
    const quantum = pick(2) + 1
    const range = { start: 0, end: 200 * quantum }
    const periods = []
    for (let t = 0; t < range.end; t += 10 * quantum) periods.push({ start: t, end: t + (5 + pick(4)) * quantum })
    const calendar = pick(2) ? { calendars: [{ id: 'c', periods }], defaultCalendarId: 'c' } : {}
    const count = 3 + pick(8)
    const tasks = []
    for (let i = 0; i < count; i++) {
      const task = { id: 't' + i, duration: (1 + pick(6)) * quantum }
      const roll = pick(10)
      if (roll === 0) task.manual = { start: pick(10) * quantum, end: (10 + pick(10)) * quantum }
      if (roll === 1) task.inactive = true
      if (roll === 2) task.pauses = [{ start: pick(10) * quantum, end: (10 + pick(3)) * quantum }]
      if (pick(3) === 0) task.splittable = true
      if (pick(3) === 0) task.priority = pick(3)
      tasks.push(task)
    }
    const dependencies = []
    for (let i = 0; i < count; i++) {
      for (let j = i + 1; j < count; j++) if (!pick(5)) dependencies.push({ id: i + '-' + j, from: 't' + i, to: 't' + j })
    }
    const resources = [0, 1].map(r => {
      const resource = { id: 'r' + r, capacity: 1 + pick(2) }
      const capacityPeriods = []
      for (let t = pick(10) * quantum; t < range.end; t += (15 + pick(15)) * quantum) {
        capacityPeriods.push({ start: t, end: t + (3 + pick(8)) * quantum, capacity: pick(4) })
      }
      if (pick(4)) resource.capacityPeriods = capacityPeriods
      if (!pick(3)) resource.periods = [{ start: 0, end: 80 * quantum }, { start: 90 * quantum, end: range.end }]
      return resource
    })
    const assignments = []
    for (const task of tasks) {
      for (const resource of resources) {
        if (pick(2)) continue
        const assignment = { resourceId: resource.id, taskId: task.id, units: 1 + pick(2) }
        if (!pick(2)) {
          assignment.workOffset = pick(4) * quantum
          if (pick(2)) assignment.workDuration = (1 + pick(3)) * quantum
          partials++
        }
        assignments.push(assignment)
      }
    }
    const input = { range, quantum, ...calendar, tasks, dependencies, resources, assignments }
    const result = levelResources(input, { explain: plan % 2 === 0 })
    assert.equal(result.ok, true)
    const load = calculateResourceLoad(range, result.tasks, resources, assignments, { inactiveTaskIds: result.inactiveTaskIds ?? [] })
    const overloads = load.filter(segment => segment.overload > 0)
    assert.deepEqual(result.overloads, overloads)
    const unresolved = new Set(result.unresolvedTaskIds)
    for (const segment of overloads) {
      assert.ok(segment.taskIds.some(id => unresolved.has(id)), 'plan ' + plan + ': ' + JSON.stringify(segment))
    }
    // Manual tasks never move.
    for (const task of tasks.filter(item => item.manual && !item.inactive)) {
      const placed = result.tasks.find(item => item.id === task.id)
      assert.deepEqual([placed.start, placed.end], [task.manual.start, task.manual.end])
    }
    // Replaying the leveled tasks gives the same plan.
    const replay = scheduleTasks({ ...input, tasks: result.leveledTasks })
    assert.deepEqual(replay.tasks, result.tasks)
    if (!unresolved.size) clean++
  }
  assert.ok(clean > 100 && partials > 200, clean + ' plans without unresolved tasks, ' + partials + ' partial assignments')
})

// ---- step 3: assignments that cover part of the task's work ----

test('a partial assignment adds load only during its part of the work, across pauses and breaks', () => {
  // The machine for the whole operation, one operator only for the first 3 hours of work. The work is split by lunch
  // (12–13) and by a pause (14–16), so the third hour of work is 13–14 and the operator is done at 14.
  const tasks = [work('op', [10, 12], [13, 14], [16, 19])]
  const resources = [{ id: 'machine', capacity: 1 }, { id: 'operator', capacity: 1 }]
  const assignments = [{ resourceId: 'machine', taskId: 'op' }, { resourceId: 'operator', taskId: 'op', workDuration: 3 }]
  const load = calculateResourceLoad(day, tasks, resources, assignments)
  assert.deepEqual(segments(load, 'operator').filter(item => item[2]), [[10, 12, 1, 1, 0], [13, 14, 1, 1, 0]])
  assert.deepEqual(segments(load, 'machine').filter(item => item[2]), [[10, 12, 1, 1, 0], [13, 14, 1, 1, 0], [16, 19, 1, 1, 0]])
  // An offset part: the inspector for the last 2 hours of the 6.
  const inspector = calculateResourceLoad(day, tasks, [{ id: 'i', capacity: 1 }], [{ resourceId: 'i', taskId: 'op', workOffset: 4 }])
  assert.deepEqual(segments(inspector).filter(item => item[2]), [[17, 19, 1, 1, 0]])
  assert.deepEqual(assignmentWorkPeriods(tasks[0].work, { taskId: 'op', workOffset: 1, workDuration: 3 }), [{ start: 11, end: 12 }, { start: 13, end: 14 }, { start: 16, end: 17 }])
  assert.deepEqual(assignmentWorkPeriods(tasks[0].work, { taskId: 'op' }), [{ start: 10, end: 12 }, { start: 13, end: 14 }, { start: 16, end: 19 }])
  // Offsets count from the start of the whole work, even when the range starts later.
  const clipped = calculateResourceLoad({ start: 11, end: 24 }, tasks, [{ id: 'i', capacity: 1 }], [{ resourceId: 'i', taskId: 'op', workDuration: 2 }])
  assert.deepEqual(segments(clipped).filter(item => item[2]), [[11, 12, 1, 1, 0]])
})

test('a part beyond the work is clipped, and invalid offsets are rejected', () => {
  const tasks = [work('t', [0, 4])]
  const run = assignment => calculateResourceLoad(day, tasks, [{ id: 'r', capacity: 1 }], [{ resourceId: 'r', taskId: 't', ...assignment }])
  assert.deepEqual(segments(run({ workOffset: 2, workDuration: 10 })).filter(item => item[2]), [[2, 4, 1, 1, 0]])
  assert.deepEqual(segments(run({ workOffset: 4 })).filter(item => item[2]), [])
  assert.deepEqual(segments(run({ workOffset: 9, workDuration: 1 })), [[0, 24, 0, 1, 0]])
  for (const bad of [{ workOffset: -1 }, { workOffset: 0.5 }, { workDuration: 0 }, { workDuration: -2 }, { workDuration: Number.NaN }]) {
    assert.throws(() => run(bad), RangeError, JSON.stringify(bad))
  }
  assert.throws(() => assignmentWorkPeriods([{ start: 3, end: 3 }], { taskId: 't' }), RangeError)
  // Inactive tasks carry no load, but their assignments are still validated.
  assert.throws(() => calculateResourceLoad(day, [], [{ id: 'r', capacity: 1 }], [{ resourceId: 'r', taskId: 'x', workOffset: -1 }],
    { inactiveTaskIds: ['x'] }), RangeError)
  // Leveling needs the offsets on the quantum.
  const level = assignment => () => levelResources({ range: { start: 0, end: 40 }, quantum: 2, tasks: [{ id: 't', duration: 4 }],
    resources: [{ id: 'r', capacity: 1 }], assignments: [{ resourceId: 'r', taskId: 't', ...assignment }] })
  assert.throws(level({ workOffset: 1 }), RangeError)
  assert.throws(level({ workDuration: 3 }), RangeError)
  assert.doesNotThrow(level({ workOffset: 2, workDuration: 2 }))
})

test('leveling lets tasks overlap where only part of each needs a resource', () => {
  // Two 4-hour operations each need the single operator for their first hour, and machines of their own.
  const base = {
    range: { start: 0, end: 40 },
    tasks: [{ id: 'a', duration: 4 }, { id: 'b', duration: 4 }],
    resources: [{ id: 'operator', capacity: 1 }, { id: 'm1', capacity: 1 }, { id: 'm2', capacity: 1 }],
  }
  const partial = levelResources({ ...base, assignments: [
    { resourceId: 'operator', taskId: 'a', workDuration: 1 }, { resourceId: 'm1', taskId: 'a' },
    { resourceId: 'operator', taskId: 'b', workDuration: 1 }, { resourceId: 'm2', taskId: 'b' },
  ] }, { explain: true })
  assert.deepEqual(partial.tasks.map(task => [task.id, task.start, task.end]), [['a', 0, 4], ['b', 1, 5]])
  assert.deepEqual([partial.unresolvedTaskIds, partial.overloads], [[], []])
  // The trace names only the operator's hour that was taken.
  const reasons = partial.trace.reasons.filter(item => item.kind === 'capacity' && item.taskId === 'b')
  assert.deepEqual(reasons.map(item => [item.resourceId, item.range, item.relatedTaskIds]), [['operator', { start: 0, end: 1 }, ['a']]])
  // Over the whole task, b would wait for a.
  const whole = levelResources({ ...base, assignments: [{ resourceId: 'operator', taskId: 'a' }, { resourceId: 'operator', taskId: 'b' }] })
  assert.deepEqual(whole.tasks.map(task => [task.id, task.start]), [['a', 0], ['b', 4]])
  // The operator for the last hour only: b can start at 0 but must not finish its last hour while a uses it.
  const tail = levelResources({ ...base, assignments: [
    { resourceId: 'operator', taskId: 'a', workOffset: 3 }, { resourceId: 'operator', taskId: 'b', workOffset: 3 },
  ] })
  assert.deepEqual(tail.tasks.map(task => [task.id, task.start]), [['a', 0], ['b', 1]])
  // A part that a calendar break interrupts: the operator part of b spans 11–12 and 13–14 around lunch.
  const lunch = levelResources({
    range: { start: 0, end: 40 }, calendars: [{ id: 'c', periods: [{ start: 8, end: 12 }, { start: 13, end: 17 }] }], defaultCalendarId: 'c',
    tasks: [{ id: 'a', duration: 3, startNoEarlierThan: 8 }, { id: 'b', duration: 3, startNoEarlierThan: 8 }],
    resources: [{ id: 'operator', capacity: 1 }],
    assignments: [{ resourceId: 'operator', taskId: 'a', workDuration: 2 }, { resourceId: 'operator', taskId: 'b', workOffset: 1 }],
  })
  // b's operator part (its last 2 hours) may not overlap a's operator part 8–10: b starts at 9, operator 10–12.
  assert.deepEqual(lunch.tasks.map(task => [task.id, task.start, task.end]), [['a', 8, 11], ['b', 9, 12]])
  assert.deepEqual(lunch.overloads, [])
})

test('a splittable task with a partial assignment is interrupted only where its part needs the resource', () => {
  const input = {
    range: { start: 0, end: 40 },
    tasks: [{ id: 'busy', duration: 0, manual: { start: 2, end: 4 } }, { id: 's', duration: 6, splittable: true }],
    resources: [{ id: 'crane', capacity: 1 }],
    // s needs the crane for its work hours 1–4; the manual task holds the crane 2–4.
    assignments: [{ resourceId: 'crane', taskId: 'busy' }, { resourceId: 'crane', taskId: 's', workOffset: 1, workDuration: 3 }],
  }
  const result = levelResources(input)
  // Hour 0 runs at 0–1, the crane hour 1 at 1–2, then the crane is busy: hours 2–3 run at 4–6, the rest without the crane.
  assert.deepEqual(result.tasks[1].work, [{ start: 0, end: 2 }, { start: 4, end: 8 }])
  assert.deepEqual([result.unresolvedTaskIds, result.overloads], [[], []])
  // Without the split, s waits until the crane is free for its part: the crane hours 1–4 must fit after 4, so it starts at 3.
  const whole = levelResources({ ...input, tasks: [input.tasks[0], { id: 's', duration: 6 }] })
  assert.deepEqual([whole.tasks[1].start, whole.tasks[1].end], [3, 9])
  assert.deepEqual(whole.overloads, [])
})

test('a manual task with a partial assignment is checked only over its part', () => {
  const input = {
    range: { start: 0, end: 40 },
    tasks: [{ id: 'm', duration: 0, manual: { start: 0, end: 6 } }, { id: 'n', duration: 0, manual: { start: 4, end: 8 } }],
    resources: [{ id: 'r', capacity: 1 }],
    assignments: [{ resourceId: 'r', taskId: 'm', workDuration: 4 }, { resourceId: 'r', taskId: 'n' }],
  }
  const result = levelResources(input)
  assert.deepEqual([result.unresolvedTaskIds, result.overloads], [[], []])
  const tight = levelResources({ ...input, assignments: [{ resourceId: 'r', taskId: 'm', workDuration: 5 }, { resourceId: 'r', taskId: 'n' }] }, { explain: true })
  assert.deepEqual(tight.unresolvedTaskIds, ['n'])
  assert.deepEqual(tight.overloads.map(item => [item.start, item.end, item.taskIds]), [[4, 5, ['m', 'n']]])
})

test('consumers of resources and assignments keep or check the new fields', () => {
  // projectResourceTimeline shows the whole task on the row of a partial assignment, once; replacing the resource keeps the part.
  const projection = projectResourceTimeline({
    resources: [{ id: 'op', label: 'Operator' }, { id: 'mc', label: 'Machine' }],
    tasks: [{ id: 't', label: 'Turn', start: 0, end: 10 }],
    assignments: [{ resourceId: 'op', taskId: 't', workDuration: 2 }, { resourceId: 'mc', taskId: 't' }],
  })
  assert.deepEqual(projection.bars.map(bar => [bar.rowId, bar.start, bar.end]), [['op', 0, 10], ['mc', 0, 10]])
  const moved = proposeResourceAssignment({ assignments: [{ resourceId: 'op', taskId: 't', units: 2, workOffset: 1, workDuration: 2 }] },
    { kind: 'replace', taskId: 't', fromResourceId: 'op', toResourceId: 'mc' })
  assert.deepEqual(moved.assignments, [{ resourceId: 'mc', taskId: 't', units: 2, workOffset: 1, workDuration: 2 }])
  // A planning snapshot validates the new fields.
  const fixture = JSON.parse(readFileSync(new URL('./fixtures/snapshots/v1/planning.json', import.meta.url), 'utf8'))
  const parse = change => {
    const doc = structuredClone(fixture)
    change(doc.data)
    return parseWeaveSnapshot(JSON.stringify(doc))
  }
  assert.equal(parse(data => {
    data.resources[0].capacityPeriods = [{ start: 0, end: 10, capacity: 2 }, { start: 10, end: 20, capacity: 0 }]
    data.assignments[0].workDuration = 5
  }).ok, true)
  for (const change of [
    data => { data.resources[0].capacityPeriods = [{ start: 0, end: 10, capacity: 2 }, { start: 5, end: 20, capacity: 0 }] },
    data => { data.resources[0].capacityPeriods = [{ start: 0, end: 10, capacity: -1 }] },
    data => { data.resources[0].capacityPeriods = 'often' },
    data => { data.assignments[0].workOffset = -3 },
    data => { data.assignments[0].workDuration = 0 },
  ]) {
    const result = parse(change)
    assert.equal(result.ok, false, change.toString())
    assert.ok(result.diagnostics.some(item => item.code === 'structure'), JSON.stringify(result.diagnostics))
  }
})
