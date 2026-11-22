import assert from 'node:assert/strict'
import { test } from 'node:test'
import * as core from '@eightkk/vue-weave/core'
import { sparseLink as link, task } from './helpers/builders.mjs'
import { attempt, seededRandom, sha256Json, withPlainTrace } from './helpers/seeded.mjs'

const {
  collectScheduleReasons, levelResources, propagateEdit, rescheduleFromStatusDate, scheduleTasks, scheduledBarFields,
  toPlanningDiagnostics,
} = core

const range = { start: 0, end: 100 }
const sub = (id, duration, parentId, fields = {}) => ({ id, duration, parentId, ...fields })
const dates = result => {
  assert.equal(result.ok, true, JSON.stringify(result))
  return Object.fromEntries(result.tasks.map(item => [item.id, [item.start, item.end]]))
}
const byId = (result, id) => result.tasks.find(item => item.id === id)

test('a summary task spans its subtasks and ignores its own duration', () => {
  const input = {
    range,
    tasks: [task('S', 50), sub('a', 3, 'S'), sub('b', 5, 'S'), task('c', 2)],
    dependencies: [link('a', 'b')],
  }
  const original = JSON.stringify(input)
  const result = scheduleTasks(input)
  assert.deepEqual(dates(result), { S: [0, 8], a: [0, 3], b: [3, 8], c: [0, 2] })
  const summary = byId(result, 'S')
  assert.equal(summary.summary, true)
  assert.deepEqual(summary.work, [])
  assert.equal(summary.parentId, undefined)
  assert.equal(byId(result, 'a').parentId, 'S')
  assert.equal(byId(result, 'a').summary, undefined)
  assert.equal(byId(result, 'c').parentId, undefined)
  assert.equal(result.finish, 8)
  assert.deepEqual(scheduledBarFields(summary), { start: 0, end: 8, critical: true, latestEnd: 8 })
  assert.equal(JSON.stringify(input), original)
})

test('FS and SS links into a summary bind the start of every subtask', () => {
  const tasks = [task('x', 4), task('S', 0), sub('a', 2, 'S'), sub('b', 3, 'S', { startNoEarlierThan: 6 })]
  assert.deepEqual(dates(scheduleTasks({ range, tasks, dependencies: [link('x', 'S')] })),
    { x: [0, 4], S: [4, 9], a: [4, 6], b: [6, 9] })
  assert.deepEqual(dates(scheduleTasks({ range, tasks, dependencies: [link('x', 'S', 'SS', 1)] })),
    { x: [0, 4], S: [1, 9], a: [1, 3], b: [6, 9] })
  assert.deepEqual(dates(scheduleTasks({ range, tasks, dependencies: [link('x', 'S', 'FS', -1)] })),
    { x: [0, 4], S: [3, 9], a: [3, 5], b: [6, 9] })
})

test('FF and SF links into a summary are rejected', () => {
  const tasks = [task('x', 4), task('S', 0), sub('a', 2, 'S')]
  for (const type of ['FF', 'SF']) {
    assert.throws(() => scheduleTasks({ range, tasks, dependencies: [link('x', 'S', type)] }),
      new RegExp(`Dependency x-S is ${type} into summary task S; only FS and SS links can end at a summary task`))
  }
  // Every link type may end at a subtask, and start at a summary.
  for (const type of ['FS', 'SS', 'FF', 'SF']) {
    assert.equal(scheduleTasks({ range, tasks, dependencies: [link('x', 'a', type)] }).ok, true)
    assert.equal(scheduleTasks({ range, tasks, dependencies: [link('S', 'x', type)] }).ok, true)
  }
})

test('links from a summary use its rolled-up start or finish', () => {
  // S spans a [0, 2) and b [3, 5).
  const tasks = [task('S', 0), sub('a', 2, 'S'), sub('b', 2, 'S', { startNoEarlierThan: 3 }), task('y', 1)]
  const cases = [['FS', 0, [5, 6]], ['FF', 0, [4, 5]], ['SS', 1, [1, 2]], ['SF', 3, [2, 3]], ['FS', -2, [3, 4]]]
  for (const [type, lag, expected] of cases) {
    const result = scheduleTasks({ range, tasks, dependencies: [link('S', 'y', type, lag)] })
    assert.deepEqual(dates(result).y, expected, type + ' ' + lag)
  }
})

test('nested summaries roll up and pass links down to every leaf', () => {
  const input = {
    range,
    tasks: [
      task('x', 2), task('P', 0), task('S1', 0, { parentId: 'P' }), sub('a', 3, 'S1'), sub('b', 1, 'S1'), sub('c', 2, 'P'),
      task('y', 1),
    ],
    dependencies: [link('x', 'P'), link('S1', 'c'), link('P', 'y')],
  }
  const result = scheduleTasks(input)
  assert.deepEqual(dates(result), { x: [0, 2], P: [2, 7], S1: [2, 5], a: [2, 5], b: [2, 3], c: [5, 7], y: [7, 8] })
  assert.equal(byId(result, 'S1').parentId, 'P')
  assert.equal(byId(result, 'S1').summary, true)
  assert.deepEqual(result.criticalDependencyIds, ['x-P', 'S1-c', 'P-y'])
})

test('startNoEarlierThan and finishNoLaterThan of a summary apply to its subtasks', () => {
  const tasks = [task('P', 0, { startNoEarlierThan: 5 }), task('S', 0, { parentId: 'P', startNoEarlierThan: 3 }), sub('a', 2, 'S'), sub('b', 2, 'P')]
  assert.deepEqual(dates(scheduleTasks({ range, tasks })), { P: [5, 7], S: [5, 7], a: [5, 7], b: [5, 7] })
  const late = scheduleTasks({ range, tasks: [task('S', 0, { finishNoLaterThan: 4 }), sub('a', 2, 'S'), sub('b', 3, 'S'), task('z', 10)] })
  assert.deepEqual([byId(late, 'a').latestEnd, byId(late, 'b').latestEnd, byId(late, 'S').latestEnd], [4, 4, 4])
  const failure = scheduleTasks({ range, tasks: [task('S', 0, { finishNoLaterThan: 4 }), sub('a', 5, 'S')] })
  assert.deepEqual(failure, { ok: false, code: 'infeasible', taskId: 'a', constraints: ['range', 'finishNoLaterThan'], dependencyIds: [] })
  assert.deepEqual(toPlanningDiagnostics(failure).map(item => item.entities), [[{ kind: 'task', id: 'a' }]])
})

test('constraints that a summary cannot have are rejected', () => {
  const forbidden = [
    { fixedStart: 1 }, { startNoLaterThan: 1 }, { finishNoEarlierThan: 1 }, { manual: { start: 0, end: 1 } }, { mode: 'alap' },
  ]
  for (const fields of forbidden) {
    const key = Object.keys(fields)[0]
    assert.throws(() => scheduleTasks({ range, tasks: [task('S', 0, fields), sub('a', 1, 'S')] }), new RegExp('Summary task S cannot have ' + key))
  }
  // A summary ignores its calendar, pauses, splittable flag and priority.
  const result = scheduleTasks({
    range, calendars: [{ id: 'c', periods: [{ start: 50, end: 60 }] }],
    tasks: [task('S', 3, { calendarId: 'c', pauses: [{ start: 0, end: 5 }], splittable: true, priority: 2 }), sub('a', 1, 'S')],
  })
  assert.deepEqual(dates(result), { S: [0, 1], a: [0, 1] })
})

test('hierarchy errors name the tasks', () => {
  assert.throws(() => scheduleTasks({ range, tasks: [sub('a', 1, 'missing')] }), /^Error: Unknown parent task missing of task a$/)
  assert.throws(() => scheduleTasks({ range, tasks: [sub('a', 1, 'a')] }), /The parent IDs of these tasks form a cycle: a → a/)
  assert.throws(() => scheduleTasks({ range, tasks: [task('z', 1), sub('a', 1, 'b'), sub('b', 1, 'c'), sub('c', 1, 'a')] }),
    /The parent IDs of these tasks form a cycle: a → b → c → a/)
  assert.throws(() => scheduleTasks({ range, tasks: [task('a', 1, { parentId: '' })] }), /Invalid parent task ID: a/)
  const tasks = [task('P', 0), task('S', 0, { parentId: 'P' }), sub('a', 1, 'S'), task('x', 1)]
  for (const [from, to, summary, subtask] of [['P', 'a', 'P', 'a'], ['a', 'P', 'P', 'a'], ['S', 'a', 'S', 'a'], ['P', 'S', 'P', 'S']]) {
    assert.throws(() => scheduleTasks({ range, tasks, dependencies: [link(from, to)] }),
      new RegExp(`Dependency ${from}-${to} links summary task ${summary} with its own subtask ${subtask}`))
  }
  // Inactive tasks are still validated.
  assert.throws(() => scheduleTasks({ range, tasks: [task('S', 0, { inactive: true }), sub('a', 1, 'S')], dependencies: [link('S', 'a')] }),
    /links summary task S with its own subtask a/)
})

test('cycles through a summary roll-up are reported like other cycles', () => {
  const result = scheduleTasks({
    range,
    tasks: [task('S', 0), sub('a', 2, 'S'), sub('b', 1, 'S'), task('x', 1)],
    dependencies: [link('S', 'x'), link('x', 'a')],
  })
  assert.deepEqual(result, { ok: false, code: 'cycle', cycles: [{ taskIds: ['S', 'a', 'x'], dependencyIds: ['S-x', 'x-a'] }] })
  assert.deepEqual(toPlanningDiagnostics(result)[0].entities.map(item => item.id), ['S', 'a', 'x', 'S-x', 'x-a'])
  // A link into a summary binds its subtasks, so a path from a subtask back to it is a cycle without the summary.
  const into = scheduleTasks({
    range, tasks: [task('S', 0), sub('a', 1, 'S'), sub('b', 1, 'S'), task('x', 1)], dependencies: [link('x', 'S'), link('b', 'x')],
  })
  assert.deepEqual(into.cycles, [{ taskIds: ['b', 'x'], dependencyIds: ['x-S', 'b-x'] }])
})

test('float and critical flags of a summary roll up from its subtasks', () => {
  // S → y (FS), z is the long chain; a and b get their latest finish from y.
  const fs = scheduleTasks({
    range, tasks: [task('S', 0), sub('a', 2, 'S'), sub('b', 1, 'S'), task('y', 3), task('z', 10), task('x', 1)],
    dependencies: [link('S', 'y'), link('x', 'S')],
  })
  const row = id => { const item = byId(fs, id); return [item.latestStart, item.latestEnd, item.totalFloat, item.workFloat, item.critical] }
  assert.deepEqual(row('a'), [5, 7, 4, 4, false])
  assert.deepEqual(row('b'), [6, 7, 5, 5, false])
  assert.deepEqual(row('S'), [5, 7, 4, 4, false])
  assert.deepEqual(row('x'), [4, 5, 4, 4, false])
  // SS from a summary limits only the subtask that starts it: b may slip until the project finish.
  const ss = scheduleTasks({
    range, tasks: [task('S', 0), sub('a', 2, 'S'), sub('b', 2, 'S', { startNoEarlierThan: 4 }), task('y', 3), task('z', 10)],
    dependencies: [link('S', 'y', 'SS')],
  })
  assert.deepEqual(['a', 'b', 'S', 'y'].map(id => byId(ss, id).totalFloat), [7, 4, 4, 7])
  // One critical subtask makes the summary critical; manual subtasks give no float.
  const critical = scheduleTasks({
    range, tasks: [task('S', 0), sub('a', 2, 'S'), sub('b', 5, 'S'), sub('m', 1, 'S', { manual: { start: 0, end: 1 } }), task('M', 0), sub('n', 1, 'M', { manual: { start: 1, end: 2 } })],
  })
  assert.deepEqual(['a', 'b', 'S', 'M'].map(id => [byId(critical, id).totalFloat, byId(critical, id).critical]),
    [[3, false], [0, true], [0, true], [0, false]])
})

test('critical links into a summary bind a critical subtask', () => {
  const result = scheduleTasks({
    range, tasks: [task('x', 2), task('S', 0), sub('a', 1, 'S'), sub('b', 4, 'S'), task('w', 1)],
    dependencies: [link('x', 'S'), link('w', 'S', 'SS')],
  })
  assert.deepEqual(result.criticalDependencyIds, ['x-S'])
  assert.deepEqual([byId(result, 'a').critical, byId(result, 'b').critical, byId(result, 'S').critical], [false, true, true])
})

test('ALAP subtasks stay within the links of their summary', () => {
  const result = scheduleTasks({
    range, tasks: [task('S', 0), sub('a', 2, 'S', { mode: 'alap' }), sub('b', 4, 'S'), task('y', 1), task('z', 10)],
    dependencies: [link('S', 'y')],
  })
  assert.deepEqual(dates(result), { S: [0, 4], a: [2, 4], b: [0, 4], y: [4, 5], z: [0, 10] })
  assert.deepEqual([byId(result, 'a').earliestStart, byId(result, 'S').earliestStart], [0, undefined])
})

test('manual subtasks report conflicts with links into their summary', () => {
  const result = scheduleTasks({
    range, tasks: [task('x', 3), task('S', 0), sub('a', 2, 'S'), sub('m', 1, 'S', { manual: { start: 1, end: 2 } })],
    dependencies: [link('x', 'S')],
  })
  assert.deepEqual(dates(result), { x: [0, 3], S: [1, 5], a: [3, 5], m: [1, 2] })
  assert.deepEqual(result.manualConflicts, [{ taskId: 'm', dependencyId: 'x-S' }])
})

test('inactive summaries make their subtasks inactive, and a summary of inactive subtasks is inactive', () => {
  const result = scheduleTasks({
    range,
    tasks: [task('S', 0, { inactive: true }), sub('a', 1, 'S'), task('T', 0), sub('b', 1, 'T', { inactive: true }), task('c', 2)],
    dependencies: [link('a', 'c'), link('T', 'c')],
  })
  assert.deepEqual(dates(result), { c: [0, 2] })
  assert.deepEqual(result.inactiveTaskIds, ['S', 'a', 'T', 'b'])
})

test('explain names the summary a subtask inherits a constraint from', () => {
  const result = scheduleTasks({
    range, tasks: [task('S', 0, { startNoEarlierThan: 3 }), sub('a', 2, 'S'), task('x', 4), task('T', 0), sub('b', 1, 'T'), task('y', 1)],
    dependencies: [link('x', 'T'), link('T', 'y')],
  }, { explain: true })
  const earliest = id => collectScheduleReasons(result.trace, id, { phases: ['earliest'] })[0]
  assert.deepEqual([earliest('a').kind, earliest('a').constraint, earliest('a').relatedTaskIds], ['constraint', 'startNoEarlierThan', ['S']])
  assert.deepEqual([earliest('b').kind, earliest('b').dependencyId, earliest('b').relatedTaskIds], ['dependency', 'x-T', ['x']])
  const latest = collectScheduleReasons(result.trace, 'b', { phases: ['latest'] })[0]
  assert.deepEqual([latest.kind, latest.dependencyId, latest.relatedTaskIds], ['dependency', 'T-y', ['y']])
  assert.deepEqual(result.trace.taskReasonIds.get('S'), [])
})

test('explain names the subtask that bounds the latest dates of a link into a summary', () => {
  // x -> S binds both leaves; only l2 (finishNoLaterThan 4) limits the latest finish of x.
  const result = scheduleTasks({
    range, tasks: [task('x', 2), task('y', 20), task('S', 0), sub('l1', 2, 'S'), sub('l2', 2, 'S', { finishNoLaterThan: 4 })],
    dependencies: [link('x', 'S')],
  }, { explain: true })
  assert.deepEqual([byId(result, 'x').latestEnd, byId(result, 'l1').latestStart, byId(result, 'l2').latestStart], [2, 18, 2])
  const reasons = result.trace.reasons.filter(reason => reason.taskId === 'x' && reason.phase === 'latest')
  assert.deepEqual(reasons.map(reason => [reason.kind, reason.dependencyId, reason.relatedTaskIds]), [['dependency', 'x-S', ['l2']]])
  const own = new Set(result.trace.taskReasonIds.get('l2'))
  assert.ok(reasons[0].parentReasonIds.length > 0 && reasons[0].parentReasonIds.every(id => own.has(id)))
})

test('propagateEdit cascades subtask edits through summaries and refuses summary edits', () => {
  const input = {
    range, tasks: [task('S', 0), sub('a', 2, 'S'), sub('b', 3, 'S'), task('y', 1)], dependencies: [link('a', 'b'), link('S', 'y')],
  }
  const result = propagateEdit(input, { id: 'a', start: 2 })
  assert.equal(result.ok, true)
  assert.deepEqual(result.changes.map(change => [change.id, change.after.start, change.after.end]),
    [['S', 2, 7], ['a', 2, 4], ['b', 4, 7], ['y', 7, 8]])
  assert.throws(() => propagateEdit(input, { id: 'S', start: 3 }), /Cannot edit summary task S/)
})

test('rescheduleFromStatusDate frees started subtasks from the start bounds of their summary', () => {
  const input = {
    range, tasks: [task('x', 4), task('S', 0, { startNoEarlierThan: 4 }), sub('a', 4, 'S'), sub('b', 2, 'S')],
    dependencies: [link('x', 'S')],
  }
  // The plan has x [0, 4), then a [4, 8) and b [4, 6). At status date 6, x has not started, a is half done and b is
  // done: a and b keep their dates although x, which their summary waits for, now runs [6, 10).
  const result = rescheduleFromStatusDate(input, 6, new Map([['a', 0.5], ['b', 1], ['S', 0.4]]))
  assert.deepEqual(dates(result), { x: [6, 10], S: [4, 8], a: [4, 8], b: [4, 6] })
  assert.deepEqual(result.criticalDependencyIds, [])
  // An unstarted subtask still waits for the link into its summary.
  const waiting = rescheduleFromStatusDate(input, 3, new Map())
  assert.deepEqual(dates(waiting), { x: [3, 7], S: [7, 11], a: [7, 11], b: [7, 9] })
})

test('levelResources levels subtasks and rolls summaries up from them', () => {
  const input = {
    range, tasks: [task('S', 0), sub('a', 2, 'S'), sub('b', 3, 'S'), task('y', 1)], dependencies: [link('S', 'y')],
    resources: [{ id: 'r', capacity: 1 }],
    assignments: [{ resourceId: 'r', taskId: 'a' }, { resourceId: 'r', taskId: 'b' }, { resourceId: 'r', taskId: 'S', units: 5 }],
  }
  const result = levelResources(input, { explain: true })
  // b has less float than a, so it takes the resource first.
  assert.deepEqual(dates(result), { S: [0, 5], a: [3, 5], b: [0, 3], y: [5, 6] })
  assert.deepEqual(result.delays.map(delay => [delay.taskId, delay.cause]), [['a', 'capacity'], ['y', 'predecessor']])
  assert.deepEqual(result.overloads, [])
  assert.deepEqual(result.unresolvedTaskIds, [])
  assert.deepEqual(dates(scheduleTasks({ ...input, tasks: result.leveledTasks })), dates(result))
})

test('buildPlacementInput moves placed subtasks of an unplaced summary to the nearest placed ancestor', () => {
  const input = {
    range, tasks: [task('P', 0), task('S', 0, { parentId: 'P' }), sub('a', 2, 'S'), sub('b', 1, 'S'), task('T', 0), sub('c', 1, 'T')],
  }
  const placement = core.buildPlacementInput(input, ['P', 'a', 'c'])
  assert.deepEqual(placement.input.tasks, [task('P', 0), sub('a', 2, 'P'), task('c', 1)])
  assert.deepEqual(dates(scheduleTasks(placement.input)), { P: [0, 2], a: [0, 2], c: [0, 1] })
  assert.equal(input.tasks[2].parentId, 'S')
})

test('deep summary hierarchies and long chains under a summary are handled without recursion', () => {
  const count = 12000
  const nested = [task('t0', 0)]
  for (let i = 1; i < count; i++) nested.push(task('t' + i, i === count - 1 ? 2 : 0, { parentId: 't' + (i - 1) }))
  const deep = scheduleTasks({ range, tasks: [task('x', 3), ...nested], dependencies: [link('x', 't0')] })
  assert.deepEqual([byId(deep, 't0').start, byId(deep, 't0').end, byId(deep, 't11999').start], [3, 5, 3])
  const chain = [task('S', 0)], links = []
  for (let i = 0; i < count; i++) {
    chain.push(sub('c' + i, 1, 'S'))
    if (i) links.push(link('c' + (i - 1), 'c' + i))
  }
  const long = scheduleTasks({ range: { start: 0, end: count + 10 }, tasks: [...chain, task('y', 1)], dependencies: [...links, link('S', 'y')] })
  assert.deepEqual([byId(long, 'S').start, byId(long, 'S').end, byId(long, 'y').start, byId(long, 'S').critical], [0, count, count, true])
})

// Seeded plans without `parentId` mixing calendars, quanta, all link types and lags, bounds, ALAP, manual, inactive,
// pauses and leveling flags. The digest was produced by release 0.5.0 before summary tasks were added; it must not
// change, because plans without hierarchy are scheduled exactly as before. (It was updated once, when adjacent leveling
// `capacity` reasons of equal capacity were merged into one; only the leveling traces changed.)
test('plans without hierarchy give the same results as before summary tasks', () => {
  assert.equal(flatPlanDigest(), 'e2e9b3e638c9d9618f11ef02dc9c3fa6b70c7f76a0ad3cbfd0fc74d530c3712c')
})

function flatPlanDigest() {
  const { pick } = seededRandom(20261118)
  const outputs = []
  const run = fn => attempt(fn)
  for (let plan = 0; plan < 150; plan++) {
    const quantum = pick(2) + 1
    const range = { start: 0, end: 120 * quantum }
    const periods = []
    for (let t = 0; t < range.end; t += 10 * quantum) periods.push({ start: t, end: t + (6 + pick(3)) * quantum })
    const calendar = pick(2) ? { calendars: [{ id: 'c', periods }], defaultCalendarId: 'c' } : {}
    const count = 3 + pick(8)
    const tasks = []
    for (let i = 0; i < count; i++) {
      const task = { id: 't' + i, duration: pick(5) * quantum }
      const roll = pick(12)
      if (roll === 0) task.startNoEarlierThan = pick(20) * quantum
      if (roll === 1) task.finishNoLaterThan = (40 + pick(40)) * quantum
      if (roll === 2) task.mode = 'alap'
      if (roll === 3) task.manual = { start: pick(10) * quantum, end: (10 + pick(10)) * quantum }
      if (roll === 4) task.inactive = true
      if (roll === 5) task.pauses = [{ start: pick(10) * quantum, end: (10 + pick(3)) * quantum }]
      if (roll === 6) task.splittable = true
      if (roll === 7) task.priority = pick(3)
      tasks.push(task)
    }
    const dependencies = []
    for (let i = 0; i < count; i++) {
      for (let j = i + 1; j < count; j++) {
        if (pick(4)) continue
        dependencies.push({ id: 'l' + i + '-' + j, from: 't' + i, to: 't' + j, type: ['FS', 'SS', 'FF', 'SF'][pick(4)], lag: (pick(5) - 2) * quantum })
      }
    }
    if (plan % 25 === 7) dependencies.push({ id: 'back', from: 't' + (count - 1), to: 't0' })
    const input = { range, quantum, ...calendar, tasks, dependencies }
    const raw = run(() => core.scheduleTasks(input, { explain: true }))
    const plain = withPlainTrace(raw)
    const leveled = run(() => core.levelResources({
      ...input, resources: [{ id: 'r', capacity: 1 }], assignments: tasks.filter((_, i) => i % 2 === 0).map(task => ({ resourceId: 'r', taskId: task.id })),
    }, { explain: true }))
    const editable = tasks.find(task => !task.inactive)
    const edited = run(() => core.propagateEdit(input, { id: editable.id, start: (2 + pick(4)) * quantum }))
    const progress = new Map(tasks.filter(() => pick(2)).map(task => [task.id, pick(5) / 4]))
    const status = run(() => core.rescheduleFromStatusDate(input, (pick(20)) * quantum, progress))
    const diagnostics = run(() => core.toPlanningDiagnostics(raw))
    outputs.push([plain, withPlainTrace(leveled), edited, status, diagnostics])
  }
  return sha256Json(outputs)
}
