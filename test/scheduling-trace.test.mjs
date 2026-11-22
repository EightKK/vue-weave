import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  calculateResourceLoad, collectScheduleReasons, levelResources, scheduleTasks, toPlanningDiagnostics,
} from '@eightkk/vue-weave/core'
import { dates, link, task } from './helpers/builders.mjs'

const on = (resourceId, ...ids) => ids.map(taskId => ({ resourceId, taskId }))
const withoutTrace = ({ trace, ...rest }) => rest
/** Reasons of one task and phase as [kind, bound, candidateTime, placedTime, detail]. */
function brief(trace, taskId, phase) {
  return trace.reasons.filter(r => r.taskId === taskId && r.phase === phase).map(r => [
    r.kind, r.bound, r.candidateTime, r.placedTime, r.dependencyId ?? r.constraint ?? r.calendarId ?? r.resourceId ?? null,
  ])
}
const reasonOf = (trace, id) => trace.reasons.find(r => r.id === id)

const o01 = {
  range: { start: 0, end: 20 },
  calendars: [{ id: 'c', periods: [{ start: 0, end: 3 }, { start: 5, end: 12 }] }],
  defaultCalendarId: 'c',
  tasks: [task('A', 2), task('B', 2)],
  dependencies: [link('A', 'B', 'FS', 1)],
}
const o02 = { range: { start: 0, end: 20 }, tasks: [task('A', 2), task('C', 2), task('B', 1)], dependencies: [link('A', 'B'), link('C', 'B')] }
const o03 = {
  range: { start: 0, end: 10 },
  tasks: [task('A', 2, { priority: 2 }), task('B', 2, { priority: 1 })],
  resources: [{ id: 'R', capacity: 1 }],
  assignments: on('R', 'A', 'B'),
}

test('O01: a lagged FS start in non-working time moves to the next working start, and the trace says why', () => {
  const result = scheduleTasks(o01, { explain: true })
  assert.equal(result.ok, true)
  assert.deepEqual(dates(result), [['A', 0, 2], ['B', 5, 7]])
  assert.deepEqual(result.trace.reasons, [
    { id: 'r0', taskId: 'A', phase: 'earliest', kind: 'project-bound', bound: 'startLower', candidateTime: 0, placedTime: 0, constraint: 'range', parentReasonIds: [] },
    { id: 'r1', taskId: 'B', phase: 'earliest', kind: 'dependency', bound: 'startLower', candidateTime: 3, placedTime: 5, dependencyId: 'A-B', relatedTaskIds: ['A'], parentReasonIds: ['r0'] },
    { id: 'r2', taskId: 'B', phase: 'earliest', kind: 'calendar', bound: 'startLower', candidateTime: 3, placedTime: 5, calendarId: 'c', parentReasonIds: ['r1'] },
    { id: 'r3', taskId: 'B', phase: 'latest', kind: 'project-bound', bound: 'endUpper', candidateTime: 7, placedTime: 7, constraint: 'projectFinish', relatedTaskIds: ['B'], parentReasonIds: ['r1', 'r2'] },
    // A must finish by B's latest start 5 minus the lag; 4 is in the break, so the latest finish is 3.
    { id: 'r4', taskId: 'A', phase: 'latest', kind: 'dependency', bound: 'endUpper', candidateTime: 4, placedTime: 3, dependencyId: 'A-B', relatedTaskIds: ['B'], parentReasonIds: ['r3'] },
    { id: 'r5', taskId: 'A', phase: 'latest', kind: 'calendar', bound: 'endUpper', candidateTime: 4, placedTime: 3, calendarId: 'c', parentReasonIds: ['r4'] },
  ])
  assert.deepEqual([...result.trace.taskReasonIds], [['A', ['r0', 'r4', 'r5']], ['B', ['r1', 'r2', 'r3']]])
  assert.deepEqual(collectScheduleReasons(result.trace, 'B', { phases: ['earliest'] }).map(r => r.id), ['r1', 'r2', 'r0'])
})

test('O02: two dependencies binding the same start are both kept', () => {
  const result = scheduleTasks(o02, { explain: true })
  assert.deepEqual(dates(result), [['A', 0, 2], ['C', 0, 2], ['B', 2, 3]])
  assert.deepEqual(result.criticalDependencyIds, ['A-B', 'C-B'])
  assert.deepEqual(brief(result.trace, 'B', 'earliest'), [
    ['dependency', 'startLower', 2, 2, 'A-B'],
    ['dependency', 'startLower', 2, 2, 'C-B'],
  ])
  assert.deepEqual(brief(result.trace, 'A', 'latest'), [['dependency', 'endUpper', 2, 2, 'A-B']])
  assert.deepEqual(brief(result.trace, 'C', 'latest'), [['dependency', 'endUpper', 2, 2, 'C-B']])
  const [fromA, fromC] = result.trace.reasons.filter(r => r.taskId === 'B' && r.phase === 'earliest')
  assert.deepEqual(fromA.parentReasonIds.map(id => reasonOf(result.trace, id).taskId), ['A'])
  assert.deepEqual(fromC.parentReasonIds.map(id => reasonOf(result.trace, id).taskId), ['C'])
})

test('O03: leveling records the capacity shortage, the resource and the holding task', () => {
  const before = scheduleTasks(o03)
  const load = calculateResourceLoad(o03.range, before.tasks, o03.resources, o03.assignments)
  assert.deepEqual(load.filter(s => s.overload > 0).map(s => [s.start, s.end, s.load, s.capacity]), [[0, 2, 2, 1]])
  const result = levelResources(o03, { explain: true })
  assert.deepEqual(dates(result), [['A', 0, 2], ['B', 2, 4]])
  assert.deepEqual(result.delays.map(d => [d.taskId, d.delay, d.cause]), [['B', 2, 'capacity']])
  assert.deepEqual(result.trace.reasons, [
    { id: 'r0', taskId: 'B', phase: 'latest', kind: 'project-bound', bound: 'endUpper', candidateTime: 10, placedTime: 10, constraint: 'range', parentReasonIds: [] },
    { id: 'r1', taskId: 'A', phase: 'latest', kind: 'project-bound', bound: 'endUpper', candidateTime: 10, placedTime: 10, constraint: 'range', parentReasonIds: [] },
    { id: 'r2', taskId: 'A', phase: 'leveling', kind: 'project-bound', bound: 'startLower', candidateTime: 0, placedTime: 0, constraint: 'range', parentReasonIds: [] },
    { id: 'r3', taskId: 'B', phase: 'leveling', kind: 'project-bound', bound: 'startLower', candidateTime: 0, placedTime: 0, constraint: 'range', parentReasonIds: [] },
    {
      id: 'r4', taskId: 'B', phase: 'leveling', kind: 'capacity', bound: 'startLower', candidateTime: 0, placedTime: 2,
      resourceId: 'R', demand: 1, capacity: 1, relatedTaskIds: ['A'], range: { start: 0, end: 2 }, parentReasonIds: ['r2'],
    },
  ])
  // The holder matches the real occupancy of the leveled plan.
  const occupied = calculateResourceLoad(o03.range, result.tasks, o03.resources, o03.assignments).find(s => s.start === 0)
  assert.deepEqual([occupied.end, occupied.taskIds], [2, ['A']])
})

test('diagnostics convert overloads, cycles, infeasible tasks and unresolved leveling', () => {
  const before = scheduleTasks(o03)
  const load = calculateResourceLoad(o03.range, before.tasks, o03.resources, o03.assignments)
  assert.ok(load.some(s => s.overload === 0))
  assert.deepEqual(toPlanningDiagnostics(before, load), [{
    id: '["resource-overload","R",0,2]', code: 'resource-overload', severity: 'warning',
    entities: [{ kind: 'resource', id: 'R' }, { kind: 'task', id: 'A' }, { kind: 'task', id: 'B' }],
    range: { start: 0, end: 2 }, reasonIds: [],
  }])
  assert.deepEqual(toPlanningDiagnostics(before), [])
  assert.deepEqual(toPlanningDiagnostics(levelResources(o03, { explain: true })), [])

  const cycle = scheduleTasks({ range: o03.range, tasks: [task('a', 1), task('b', 1)], dependencies: [link('a', 'b'), link('b', 'a')] })
  assert.deepEqual(toPlanningDiagnostics(cycle, load), [{
    id: '["schedule-cycle","a","b"]', code: 'schedule-cycle', severity: 'error',
    entities: [{ kind: 'task', id: 'a' }, { kind: 'task', id: 'b' }, { kind: 'dependency', id: 'a-b' }, { kind: 'dependency', id: 'b-a' }],
    reasonIds: [],
  }])
  const infeasible = scheduleTasks({ range: o03.range, tasks: [task('a', 4), task('b', 2, { finishNoLaterThan: 3 })], dependencies: [link('a', 'b')] })
  assert.deepEqual(toPlanningDiagnostics(infeasible), [{
    id: '["schedule-infeasible","b"]', code: 'schedule-infeasible', severity: 'error',
    entities: [{ kind: 'task', id: 'b' }, { kind: 'dependency', id: 'a-b' }],
    constraints: ['finishNoLaterThan'], reasonIds: [],
  }])

  // Both tasks are fixed at 0 on one machine: leveling cannot move b, so it stays overloaded and unresolved.
  const stuck = levelResources({
    range: o03.range, tasks: [task('a', 2, { fixedStart: 0, priority: 1 }), task('b', 2, { fixedStart: 0 })],
    resources: [{ id: 'R', capacity: 1 }], assignments: on('R', 'a', 'b'),
  }, { explain: true })
  assert.equal(stuck.ok, true)
  assert.deepEqual(stuck.unresolvedTaskIds, ['b'])
  assert.deepEqual(brief(stuck.trace, 'b', 'leveling'), [
    ['constraint', 'startLower', 0, 0, 'fixedStart'],
    ['capacity', 'startLower', 0, 0, 'R'],
    ['constraint', 'startUpper', 0, 0, 'fixedStart'],
    ['project-bound', 'startUpper', 0, 0, null],
    ['project-bound', 'endUpper', 2, 2, null],
  ])
  const capacity = stuck.trace.reasons.find(r => r.kind === 'capacity')
  assert.deepEqual([capacity.relatedTaskIds, capacity.range, capacity.demand, capacity.capacity], [['a'], { start: 0, end: 2 }, 1, 1])
  const horizon = stuck.trace.reasons.find(r => r.taskId === 'b' && r.phase === 'leveling' && r.kind === 'project-bound')
  assert.deepEqual(horizon.parentReasonIds.map(id => brief({ reasons: [reasonOf(stuck.trace, id)] }, 'b', 'latest')[0]),
    [['constraint', 'startUpper', 0, 0, 'fixedStart']])
  const leveling = stuck.trace.taskReasonIds.get('b').filter(id => reasonOf(stuck.trace, id).phase === 'leveling')
  assert.deepEqual(toPlanningDiagnostics(stuck), [
    {
      id: '["leveling-unresolved","b"]', code: 'leveling-unresolved', severity: 'warning',
      entities: [{ kind: 'task', id: 'b' }], range: { start: 0, end: 2 }, reasonIds: leveling,
    },
    {
      id: '["resource-overload","R",0,2]', code: 'resource-overload', severity: 'warning',
      entities: [{ kind: 'resource', id: 'R' }, { kind: 'task', id: 'a' }, { kind: 'task', id: 'b' }],
      range: { start: 0, end: 2 }, reasonIds: [capacity.id],
    },
  ])
  // Without explain the same problems are listed, without reasons.
  assert.deepEqual(toPlanningDiagnostics(levelResources({
    range: o03.range, tasks: [task('a', 2, { fixedStart: 0, priority: 1 }), task('b', 2, { fixedStart: 0 })],
    resources: [{ id: 'R', capacity: 1 }], assignments: on('R', 'a', 'b'),
  })).map(d => [d.id, d.reasonIds]), [['["leveling-unresolved","b"]', []], ['["resource-overload","R",0,2]', []]])

  assert.throws(() => toPlanningDiagnostics(null), /Invalid schedule result/)
  assert.throws(() => toPlanningDiagnostics(before, {}), /array/)
  assert.throws(() => toPlanningDiagnostics(before, [{ resourceId: 'R', start: 0, end: 2, overload: Number.NaN }]), RangeError)
})

test('every dependency type and signed lag is traced to the limit it sets', () => {
  const range = { start: 0, end: 20 }
  const cases = [
    ['FS', 1, 'startLower', 7, [7, 9]],
    ['SS', -1, 'startLower', 1, [1, 3]],
    ['FF', 2, 'endLower', 8, [6, 8]],
    ['SF', 3, 'endLower', 5, [3, 5]],
  ]
  for (const [type, lag, bound, time, placed] of cases) {
    const result = scheduleTasks({
      range, tasks: [task('A', 4, { startNoEarlierThan: 2 }), task('B', 2)], dependencies: [link('A', 'B', type, lag)],
    }, { explain: true })
    assert.deepEqual(dates(result)[1], ['B', ...placed], type)
    assert.deepEqual(brief(result.trace, 'A', 'earliest'), [['constraint', 'startLower', 2, 2, 'startNoEarlierThan']], type)
    assert.deepEqual(brief(result.trace, 'B', 'earliest'), [['dependency', bound, time, time, 'A-B']], type)
  }
  // On the predecessor, FS and FF limit the latest finish, SS and SF the latest start.
  const fs = scheduleTasks({ range, tasks: [task('A', 4, { startNoEarlierThan: 2 }), task('B', 2)], dependencies: [link('A', 'B', 'FS', 1)] }, { explain: true })
  assert.deepEqual(brief(fs.trace, 'A', 'latest'), [['dependency', 'endUpper', 6, 6, 'A-B']])
  const sf = scheduleTasks({ range, tasks: [task('A', 4), task('B', 2, { fixedStart: 10 })], dependencies: [link('A', 'B', 'SF', 5)] }, { explain: true })
  assert.deepEqual(brief(sf.trace, 'A', 'latest'), [['dependency', 'startUpper', 7, 7, 'A-B']])
})

test('tied start and finish bounds, fixed starts and the range rule follow the failure diagnosis', () => {
  const range = { start: 0, end: 20 }
  const tied = scheduleTasks({ range, tasks: [task('t', 2, { startNoEarlierThan: 3, finishNoEarlierThan: 5 })] }, { explain: true })
  assert.deepEqual(brief(tied.trace, 't', 'earliest'), [
    ['constraint', 'startLower', 3, 3, 'startNoEarlierThan'],
    ['constraint', 'endLower', 5, 5, 'finishNoEarlierThan'],
  ])
  // fixedStart 3 sets both start limits; the project finish 5 ties with it in the latest pass.
  const fixed = scheduleTasks({ range, tasks: [task('f', 2, { fixedStart: 3 })] }, { explain: true })
  assert.deepEqual(brief(fixed.trace, 'f', 'earliest'), [['constraint', 'startLower', 3, 3, 'fixedStart']])
  assert.deepEqual(brief(fixed.trace, 'f', 'latest'), [
    ['constraint', 'startUpper', 3, 3, 'fixedStart'],
    ['project-bound', 'endUpper', 5, 5, 'projectFinish'],
  ])
  // A named bound at the range start hides `range`, as in diagnose; alone, `range` is reported.
  const atStart = scheduleTasks({ range, tasks: [task('s', 2, { startNoEarlierThan: 0 }), task('r', 2)] }, { explain: true })
  assert.deepEqual(brief(atStart.trace, 's', 'earliest'), [['constraint', 'startLower', 0, 0, 'startNoEarlierThan']])
  assert.deepEqual(brief(atStart.trace, 'r', 'earliest'), [['project-bound', 'startLower', 0, 0, 'range']])
  // A one-unit task at the range start meets its finish limit with its first unit of work: both limits tie,
  // as diagnose compares them, and no calendar shift is reported.
  const unit = scheduleTasks({ range, tasks: [task('u', 1)] }, { explain: true })
  assert.deepEqual(brief(unit.trace, 'u', 'earliest'), [
    ['project-bound', 'startLower', 0, 0, 'range'],
    ['project-bound', 'endLower', 0, 1, 'range'],
  ])
  const deadline = scheduleTasks({ range, deadline: 6, tasks: [task('d', 2, { mode: 'alap' })] }, { explain: true })
  assert.deepEqual(brief(deadline.trace, 'd', 'latest'), [['project-bound', 'endUpper', 2, 2, 'projectFinish']])
  const failure = scheduleTasks({ range, deadline: 6, tasks: [task('d', 8)] }, { explain: true })
  assert.deepEqual(failure, { ok: false, code: 'infeasible', taskId: 'd', constraints: ['range', 'deadline'], dependencyIds: [] })
})

test('pauses and calendar time off are reported separately', () => {
  const range = { start: 0, end: 20 }
  const paused = scheduleTasks({
    range, tasks: [task('A', 1), task('P', 2, { pauses: [{ start: 1, end: 3 }] })], dependencies: [link('A', 'P')],
  }, { explain: true })
  assert.deepEqual(dates(paused), [['A', 0, 1], ['P', 3, 5]])
  assert.deepEqual(brief(paused.trace, 'P', 'earliest'), [
    ['dependency', 'startLower', 1, 3, 'A-P'],
    ['pause', 'startLower', 1, 3, null],
  ])
  const both = scheduleTasks({
    ...o01, tasks: [task('A', 2), task('B', 2, { pauses: [{ start: 5, end: 6 }] })],
  }, { explain: true })
  assert.deepEqual(dates(both), [['A', 0, 2], ['B', 6, 8]])
  assert.deepEqual(brief(both.trace, 'B', 'earliest'), [
    ['dependency', 'startLower', 3, 6, 'A-B'],
    ['calendar', 'startLower', 3, 5, 'c'],
    ['pause', 'startLower', 5, 6, null],
  ])
  const [dependency, calendar, pause] = both.trace.reasons.filter(r => r.taskId === 'B' && r.phase === 'earliest')
  assert.deepEqual([calendar.parentReasonIds, pause.parentReasonIds], [[dependency.id], [dependency.id]])
})

test('ALAP placement reasons point to placed successors and the project finish', () => {
  const result = scheduleTasks({
    range: { start: 0, end: 20 },
    tasks: [task('L', 5), task('C', 1, { mode: 'alap' }), task('C3', 1, { mode: 'alap' }), task('C4', 1, { mode: 'alap' }),
      task('C2', 1, { mode: 'alap' }), task('B', 1)],
    dependencies: [link('C3', 'C4'), link('C2', 'B')],
  }, { explain: true })
  assert.deepEqual(dates(result), [['L', 0, 5], ['C', 4, 5], ['C3', 3, 4], ['C4', 4, 5], ['C2', 0, 1], ['B', 1, 2]])
  assert.deepEqual(brief(result.trace, 'C', 'placement'), [['project-bound', 'endUpper', 5, 5, 'projectFinish']])
  assert.deepEqual(brief(result.trace, 'C3', 'placement'), [['dependency', 'endUpper', 4, 4, 'C3-C4']])
  assert.deepEqual(brief(result.trace, 'C2', 'placement'), [['dependency', 'endUpper', 1, 1, 'C2-B']])
  assert.deepEqual(brief(result.trace, 'L', 'placement'), [])
  const parents = id => result.trace.reasons.find(r => r.taskId === id && r.phase === 'placement').parentReasonIds
    .map(parent => [reasonOf(result.trace, parent).taskId, reasonOf(result.trace, parent).phase])
  assert.deepEqual(parents('C'), [['L', 'earliest']])
  assert.deepEqual(parents('C3'), [['C4', 'placement']])
  assert.deepEqual(parents('C2'), [['B', 'earliest']])
  assert.deepEqual(result.trace.reasons.find(r => r.taskId === 'C' && r.phase === 'placement').relatedTaskIds, ['L'])
})

test('leveling traces a dependency and capacity together and names the holders of each resource', () => {
  const input = {
    range: { start: 0, end: 40 },
    tasks: [task('a', 4, { priority: 3 }), task('x', 3, { priority: 2 }), task('b', 2), task('c', 1)],
    dependencies: [link('b', 'c')],
    resources: [{ id: 'm', capacity: 1 }, { id: 'n', capacity: 1 }],
    assignments: [...on('m', 'a', 'b'), ...on('n', 'x', 'b', 'c')],
  }
  const result = levelResources(input, { explain: true })
  // a holds m in [0,4) and x holds n in [0,3), so b waits for both and c follows b.
  assert.deepEqual(dates(result), [['a', 0, 4], ['x', 0, 3], ['b', 4, 6], ['c', 6, 7]])
  assert.deepEqual(result.delays.map(d => [d.taskId, d.cause]), [['b', 'capacity'], ['c', 'predecessor']])
  const capacity = result.trace.reasons.filter(r => r.kind === 'capacity')
  assert.deepEqual(capacity.map(r => [r.taskId, r.resourceId, r.range, r.relatedTaskIds, r.capacity]), [
    ['b', 'm', { start: 0, end: 4 }, ['a'], 1],
    ['b', 'n', { start: 0, end: 3 }, ['x'], 1],
  ])
  assert.deepEqual(brief(result.trace, 'c', 'leveling'), [['dependency', 'startLower', 6, 6, 'b-c']])
  const ancestors = collectScheduleReasons(result.trace, 'c', { phases: ['leveling'] })
  assert.deepEqual(ancestors.map(r => [r.taskId, r.kind]), [
    ['c', 'dependency'], ['b', 'project-bound'], ['b', 'capacity'], ['b', 'capacity'], ['a', 'project-bound'], ['x', 'project-bound'],
  ])
  // Each holder occupies its resource in the reported interval in the leveled plan.
  const load = calculateResourceLoad(input.range, result.tasks, input.resources, input.assignments)
  for (const reason of capacity) {
    const occupied = new Set(load.filter(s => s.resourceId === reason.resourceId && s.start < reason.range.end && s.end > reason.range.start)
      .flatMap(s => s.taskIds))
    assert.deepEqual([...occupied], reason.relatedTaskIds)
  }
  // A split task records the interval it skipped; the end moved, not the start.
  const split = levelResources({
    range: { start: 0, end: 40 }, tasks: [task('fixed', 2, { fixedStart: 2, priority: 1 }), task('b', 4, { splittable: true })],
    resources: [{ id: 'm', capacity: 1 }], assignments: on('m', 'fixed', 'b'),
  }, { explain: true })
  assert.deepEqual(brief(split.trace, 'b', 'leveling').filter(r => r[0] === 'capacity'), [['capacity', 'endLower', 4, 6, 'm']])
  assert.deepEqual(split.trace.reasons.find(r => r.kind === 'capacity').range, { start: 2, end: 4 })
})

test('leveling merges adjacent shortages of equal capacity into one reason that names every holder', () => {
  const input = {
    range: { start: 0, end: 40 },
    tasks: [task('a', 2, { priority: 3 }), task('b', 3, { priority: 2 }), task('c', 2, { priority: 1 }), task('d', 2)],
    resources: [{ id: 'm', capacity: 1, capacityPeriods: [{ start: 5, end: 6, capacity: 2 }] }],
    assignments: on('m', 'a', 'b', 'c', 'd'),
  }
  const result = levelResources(input, { explain: true })
  assert.deepEqual(dates(result), [['a', 0, 2], ['b', 2, 5], ['c', 5, 7], ['d', 7, 9]])
  const reasons = result.trace.reasons.filter(r => r.kind === 'capacity')
  assert.deepEqual(reasons.map(r => [r.taskId, r.range, r.relatedTaskIds, r.capacity]), [
    ['b', { start: 0, end: 2 }, ['a'], 1],
    // c waits behind a and b, in one reason because both hold the whole capacity of 1 back to back.
    ['c', { start: 0, end: 5 }, ['a', 'b'], 1],
    // d also fits nowhere before 7. At [5, 6) the capacity of 2 leaves room beside c, so that gap splits its reasons.
    ['d', { start: 0, end: 5 }, ['a', 'b'], 1],
    ['d', { start: 6, end: 7 }, ['c'], 1],
  ])
  // The parents are the leveling reasons of every holder.
  const leveling = id => result.trace.taskReasonIds.get(id).filter(reason => reasonOf(result.trace, reason).phase === 'leveling')
  assert.deepEqual(reasons[1].parentReasonIds, [...leveling('a'), ...leveling('b')])
  // A change of capacity starts a new reason: b holds both units where the capacity is 2.
  const changed = levelResources({
    range: { start: 0, end: 40 },
    tasks: [task('a', 2, { priority: 3 }), task('b', 2, { priority: 2 }), task('c', 1)],
    resources: [{ id: 'm', capacity: 1, capacityPeriods: [{ start: 2, end: 4, capacity: 2 }] }],
    assignments: [...on('m', 'a', 'c'), { resourceId: 'm', taskId: 'b', units: 2 }],
  }, { explain: true })
  assert.deepEqual(dates(changed), [['a', 0, 2], ['b', 2, 4], ['c', 4, 5]])
  assert.deepEqual(changed.trace.reasons.filter(r => r.kind === 'capacity' && r.taskId === 'c').map(r => [r.range, r.relatedTaskIds, r.capacity]), [
    [{ start: 0, end: 2 }, ['a'], 1],
    [{ start: 2, end: 4 }, ['b'], 2],
  ])
})

test('leveling explains 2,000 tasks on one resource with one capacity reason per delayed task', () => {
  const count = 2000
  const tasks = Array.from({ length: count }, (_, i) => task('t' + i, 1))
  const input = {
    range: { start: 0, end: count + 10 }, tasks, resources: [{ id: 'r', capacity: 1 }],
    assignments: on('r', ...tasks.map(item => item.id)),
  }
  // Each task used to get one reason per earlier reservation, about two million in all, computed in cubic time.
  const result = levelResources(input, { explain: true })
  assert.deepEqual(withoutTrace(result), levelResources(input))
  const capacity = result.trace.reasons.filter(r => r.kind === 'capacity')
  assert.equal(capacity.length, count - 1)
  assert.ok(result.trace.reasons.length <= 5 * count, String(result.trace.reasons.length))
  // Equal tasks are placed in ID order; the last one waits behind all the others in one reason.
  const last = capacity.at(-1)
  assert.deepEqual([last.taskId, last.range, last.relatedTaskIds.length, last.relatedTaskIds[0]], ['t999', { start: 0, end: 1999 }, 1999, 't0'])
})

test('explain changes no date, float, critical flag, delay or unresolved task', () => {
  const shifts = [{ start: 0, end: 4 }, { start: 5, end: 9 }, { start: 24, end: 28 }, { start: 29, end: 33 }]
  const calendar = { calendars: [{ id: 'shift', periods: shifts }], defaultCalendarId: 'shift' }
  const range = { start: 0, end: 40 }
  const schedules = [
    o01, o02,
    { range, ...calendar, tasks: [task('a', 4), task('b', 5), task('slack', 2)], dependencies: [link('a', 'b')] },
    { range, tasks: [task('a', 4), task('b', 3), task('c', 2), task('d', 0)],
      dependencies: [link('a', 'b', 'SS', -2), link('a', 'c', 'FF', 3), link('b', 'd', 'SF', 5)] },
    { range, ...calendar, tasks: [task('a', 2, { mode: 'alap' }), task('b', 6), task('c', 1, { mode: 'alap', finishNoLaterThan: 30 })],
      dependencies: [link('a', 'c')], deadline: 34 },
    { range, tasks: [task('a', 3), task('b', 4, { pauses: [{ start: 4, end: 6 }] }), task('m', 0, { mode: 'alap' })],
      dependencies: [link('a', 'b'), link('b', 'm', 'FS', 1)] },
    { range, tasks: [task('f', 2, { fixedStart: 5 }), task('g', 1, { startNoLaterThan: 9, finishNoEarlierThan: 8 })], dependencies: [link('f', 'g')] },
    { range, tasks: [task('a', 1), task('b', 1)], dependencies: [link('a', 'b'), link('b', 'a')] },
    { range, deadline: 3, tasks: [task('a', 4)] },
  ]
  for (const input of schedules) {
    const plain = scheduleTasks(input), explained = scheduleTasks(input, { explain: true })
    assert.equal('trace' in plain, false)
    assert.equal('trace' in scheduleTasks(input, {}), false)
    assert.equal('trace' in scheduleTasks(input, { explain: false }), false)
    assert.equal('trace' in explained, plain.ok)
    assert.deepEqual(plain.ok ? withoutTrace(explained) : explained, plain)
  }
  const machine = [{ id: 'm', capacity: 1 }]
  const levelings = [
    o03,
    { range, tasks: [task('a', 4), task('b', 2)], resources: machine, assignments: on('m', 'a', 'b') },
    { range, tasks: [task('a', 4), task('b', 2), task('c', 1)], dependencies: [link('b', 'c')], resources: machine, assignments: on('m', 'a', 'b') },
    { range, tasks: [task('fixed', 2, { fixedStart: 2, priority: 1 }), task('b', 4, { splittable: true })], resources: machine, assignments: on('m', 'fixed', 'b') },
    { range, ...calendar, tasks: [task('a', 4), task('b', 2)], resources: machine, assignments: on('m', 'a', 'b') },
    { range, tasks: [task('a', 4)], resources: [{ id: 'm', capacity: 1, periods: [{ start: 10, end: 20 }] }], assignments: on('m', 'a') },
    { range, tasks: [task('a', 3), task('b', 2), task('c', 2), task('d', 1)], dependencies: [link('a', 'd')],
      resources: [{ id: 'm', capacity: 2 }], assignments: [...on('m', 'a', 'b', 'c'), { resourceId: 'm', taskId: 'd', units: 2 }] },
    { range, tasks: [task('a', 2, { fixedStart: 0, priority: 1 }), task('b', 2, { fixedStart: 0 })], resources: machine, assignments: on('m', 'a', 'b') },
    { range, tasks: [task('a', 3, { mode: 'alap' }), task('b', 3, { pauses: [{ start: 1, end: 2 }] })], resources: machine, assignments: on('m', 'a', 'b') },
  ]
  for (const input of levelings) {
    const plain = levelResources(input), explained = levelResources(input, { explain: true })
    assert.equal(plain.ok, true)
    assert.equal('trace' in plain, false)
    assert.deepEqual(withoutTrace(explained), plain)
    for (const id of input.tasks.map(t => t.id)) assert.ok(explained.trace.taskReasonIds.get(id).length > 0, id)
  }
})

test('the trace is ordered, refers to known reasons, and bad options are rejected', () => {
  const { trace } = levelResources(o03, { explain: true })
  const seen = new Set()
  for (const reason of trace.reasons) {
    for (const parent of reason.parentReasonIds) assert.ok(seen.has(parent), reason.id)
    seen.add(reason.id)
  }
  assert.throws(() => scheduleTasks(o02, { explain: 'yes' }), /explain option must be a boolean/)
  assert.throws(() => levelResources(o03, 1), /options must be an object/)
  assert.throws(() => collectScheduleReasons(trace, 'missing'), /Unknown task/)
  assert.throws(() => collectScheduleReasons({ reasons: [], taskReasonIds: new Map([['a', ['r9']]]) }, 'a'), /Unknown schedule reason/)
})

test('collectScheduleReasons walks a long chain without recursion', () => {
  const count = 12000
  const tasks = Array.from({ length: count }, (_, i) => task('t' + i, 1))
  const dependencies = tasks.slice(1).map((t, i) => link('t' + i, t.id))
  const result = scheduleTasks({ range: { start: 0, end: count + 10 }, tasks, dependencies }, { explain: true })
  const reasons = collectScheduleReasons(result.trace, 't' + (count - 1))
  // One dependency reason per later task, the two tied range limits of t0, and the project finish of the last task.
  assert.equal(reasons.length, count + 2)
  assert.equal(new Set(reasons.map(r => r.id)).size, reasons.length)
  assert.deepEqual(reasons.slice(-2).map(r => [r.id, r.taskId, r.bound, r.constraint]), [['r0', 't0', 'startLower', 'range'], ['r1', 't0', 'endLower', 'range']])
})

test('collectScheduleReasons visits shared parents of a wide diamond lattice once', () => {
  const width = 20, layers = 30
  const id = (layer, i) => 'n' + layer + '_' + i
  const tasks = [], dependencies = []
  for (let layer = 0; layer < layers; layer++) {
    for (let i = 0; i < width; i++) {
      tasks.push(task(id(layer, i), 1))
      if (layer) for (let j = 0; j < width; j++) dependencies.push(link(id(layer - 1, j), id(layer, i)))
    }
  }
  tasks.push(task('sink', 1))
  for (let i = 0; i < width; i++) dependencies.push(link(id(layers - 1, i), 'sink'))
  const result = scheduleTasks({ range: { start: 0, end: 100 }, tasks, dependencies }, { explain: true })
  const reasons = collectScheduleReasons(result.trace, 'sink')
  // First layer: the tied start and finish range limits of each task. Later layers: one tied dependency reason per
  // incoming link. Sink: one per incoming link, plus its project finish.
  assert.equal(reasons.length, 2 * width + (layers - 1) * width * width + width + 1)
  assert.equal(new Set(reasons.map(r => r.id)).size, reasons.length)
})

test('diagnostics list manual conflicts first, one per entry, and leave conflict-free results unchanged', () => {
  const range = { start: 0, end: 40 }
  const tasks = [task('a', 5), task('m', 2, { manual: { start: 3, end: 5 } }), task('n', 2, { manual: { start: 1, end: 3 } })]
  const dependencies = [link('a', 'm'), link('a', 'n')]
  const plain = scheduleTasks({ range, tasks, dependencies })
  assert.deepEqual(plain.manualConflicts, [{ taskId: 'm', dependencyId: 'a-m' }, { taskId: 'n', dependencyId: 'a-n' }])
  assert.deepEqual(toPlanningDiagnostics(plain), [
    { id: '["manual-conflict","m","a-m"]', code: 'manual-conflict', severity: 'warning', entities: [{ kind: 'task', id: 'm' }, { kind: 'dependency', id: 'a-m' }], reasonIds: [] },
    { id: '["manual-conflict","n","a-n"]', code: 'manual-conflict', severity: 'warning', entities: [{ kind: 'task', id: 'n' }, { kind: 'dependency', id: 'a-n' }], reasonIds: [] },
  ])
  // With explain, the diagnostic points at the manual reason of the earliest pass.
  const explained = scheduleTasks({ range, tasks, dependencies }, { explain: true })
  const [first] = toPlanningDiagnostics(explained)
  const manual = explained.trace.reasons.filter(reason => reason.taskId === 'm' && reason.kind === 'manual' && reason.phase === 'earliest')
  assert.equal(manual.length, 1)
  assert.deepEqual(first.reasonIds, [manual[0].id])
  // A leveling success carries the conflicts too and lists them before unresolved tasks and overloads.
  const leveled = levelResources({ range, tasks, dependencies, resources: [{ id: 'R', capacity: 1 }], assignments: on('R', 'a', 'm') })
  assert.deepEqual(toPlanningDiagnostics(leveled).filter(item => item.code === 'manual-conflict').map(item => item.id), [first.id, '["manual-conflict","n","a-n"]'])
  assert.equal(toPlanningDiagnostics(leveled)[0].code, 'manual-conflict')
  // Without a violated link there is no new diagnostic.
  assert.deepEqual(toPlanningDiagnostics(scheduleTasks({ range, tasks: [task('a', 5), task('m', 2, { manual: { start: 10, end: 12 } })], dependencies: [link('a', 'm')] })), [])
})
