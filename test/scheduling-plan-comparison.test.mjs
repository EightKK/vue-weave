import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  buildViewBindingIndex, calculateResourceLoad, comparePlans, levelResources, planBaselines, planComparisonTargets, scheduleTasks,
} from 'vue-weave/core'

const range = { start: 0, end: 100 }
const link = (from, to, type = 'FS') => ({ id: from + '-' + to, from, to, type })
const chain = () => ({
  range,
  tasks: [{ id: 'a', duration: 2 }, { id: 'b', duration: 3 }, { id: 'c', duration: 1 }, { id: 'd', duration: 1 }],
  dependencies: [link('a', 'b'), link('b', 'c')],
})
const withTask = (input, id, patch) => ({ ...input, tasks: input.tasks.map(task => task.id === id ? { ...task, ...patch } : task) })
const emptyInput = {
  settings: [],
  tasks: { added: [], removed: [], changed: [] },
  dependencies: { added: [], removed: [], changed: [] },
  calendars: { added: [], removed: [], changed: [] },
  resources: { added: [], removed: [], changed: [] },
  assignments: { added: [], removed: [], changed: [], taskIds: [] },
}

function deepFreeze(value) {
  const stack = [value]
  while (stack.length) {
    const item = stack.pop()
    if (item && typeof item === 'object' && !Object.isFrozen(item)) {
      Object.freeze(item)
      for (const child of Object.values(item)) stack.push(child)
    }
  }
  return value
}

test('identical inputs give an empty comparison', () => {
  const input = {
    ...chain(), resources: [{ id: 'm', capacity: 1 }],
    assignments: [{ taskId: 'a', resourceId: 'm' }, { taskId: 'd', resourceId: 'm' }],
  }
  const comparison = comparePlans({ input }, { input: structuredClone(input) })
  assert.deepEqual(comparison.input, emptyInput)
  assert.equal(comparison.empty, true)
  assert.equal(comparison.complete, true)
  assert.deepEqual(comparison.result.tasks, [])
  assert.deepEqual(comparison.result.editedTaskIds, [])
  assert.deepEqual(comparison.result.consequenceTaskIds, [])
  assert.deepEqual(comparison.result.criticalDependencies, { gained: [], lost: [] })
  assert.deepEqual([comparison.result.violations.gained, comparison.result.violations.lost], [[], []])
  assert.deepEqual(comparison.result.finish, { current: 6, candidate: 6, shift: 0 })
  // a and d overlap on m in [0, 1): one unit of excess for one time unit, on both sides.
  assert.deepEqual(comparison.result.overload, [{ resourceId: 'm', current: 1, candidate: 1, change: 0 }])
})

test('an edited task is told apart from tasks that only moved as a consequence', () => {
  const current = chain()
  const candidate = withTask(current, 'a', { duration: 4 })
  deepFreeze(current)
  deepFreeze(candidate)
  const before = JSON.stringify([current, candidate])
  const comparison = comparePlans({ input: current }, { input: candidate })
  assert.equal(JSON.stringify([current, candidate]), before)
  assert.deepEqual(comparison.input.tasks, { added: [], removed: [], changed: [{ id: 'a', fields: ['duration'] }] })
  assert.deepEqual(comparison.result.editedTaskIds, ['a'])
  assert.deepEqual(comparison.result.consequenceTaskIds, ['b', 'c'])
  const [a, b] = comparison.result.tasks
  assert.equal(a.edited, true)
  assert.equal(a.input, 'changed')
  assert.deepEqual([a.startShift, a.finishShift], [0, 2])
  assert.equal(b.edited, false)
  assert.equal(b.input, 'unchanged')
  assert.deepEqual(b.fields, [])
  assert.deepEqual([b.startShift, b.finishShift], [2, 2])
  assert.deepEqual(comparison.result.finish, { current: 6, candidate: 8, shift: 2 })
  assert.equal(comparison.empty, false)
  // d is not linked and does not move: it is not listed.
  assert.equal(comparison.result.tasks.some(entry => entry.id === 'd'), false)
})

test('reasons come from each side\'s explain trace and are never merged into one cause', () => {
  const current = chain()
  const comparison = comparePlans({ input: current }, { input: withTask(current, 'a', { duration: 4 }) })
  const b = comparison.result.tasks.find(entry => entry.id === 'b')
  assert.ok(b.reasons.current.length > 0)
  assert.ok(b.reasons.candidate.length > 0)
  assert.ok(b.reasons.candidate.every(reason => reason.taskId === 'b'))
  assert.ok(b.reasons.candidate.some(reason => reason.kind === 'dependency' && reason.dependencyId === 'a-b'))
  // Precomputed results without a trace give no reasons.
  const plain = comparePlans({ input: current, result: scheduleTasks(current) }, { input: withTask(current, 'a', { duration: 4 }), result: scheduleTasks(withTask(current, 'a', { duration: 4 })) })
  assert.equal(plain.result.tasks[1].reasons, undefined)
})

test('added and removed tasks and dependencies are reported on both parts', () => {
  const current = chain()
  const candidate = {
    ...current,
    tasks: [...current.tasks.filter(task => task.id !== 'c'), { id: 'e', duration: 2 }],
    dependencies: [link('a', 'b'), link('b', 'e')],
  }
  const comparison = comparePlans({ input: current }, { input: candidate })
  assert.deepEqual(comparison.input.tasks, { added: ['e'], removed: ['c'], changed: [] })
  assert.deepEqual(comparison.input.dependencies, { added: ['b-e'], removed: ['b-c'], changed: [] })
  const c = comparison.result.tasks.find(entry => entry.id === 'c')
  const e = comparison.result.tasks.find(entry => entry.id === 'e')
  assert.deepEqual([c.input, c.edited, c.current.state, c.candidate], ['removed', true, 'scheduled', { state: 'absent' }])
  assert.deepEqual([e.input, e.edited, e.current, e.candidate.state], ['added', true, { state: 'absent' }, 'scheduled'])
  assert.deepEqual(comparison.result.editedTaskIds, ['c', 'e'])
})

test('dependency, calendar, setting and lag changes are input differences', () => {
  const current = { ...chain(), calendars: [{ id: 'cal', periods: [{ start: 0, end: 50 }] }], deadline: 90 }
  const candidate = {
    ...current, deadline: 80,
    calendars: [{ id: 'cal', periods: [{ start: 0, end: 40 }] }, { id: 'night', periods: [{ start: 50, end: 60 }] }],
    dependencies: [{ ...link('a', 'b'), lag: 1 }, link('b', 'c', 'SS')],
  }
  const comparison = comparePlans({ input: current }, { input: candidate })
  assert.deepEqual(comparison.input.settings, ['deadline'])
  assert.deepEqual(comparison.input.calendars, { added: ['night'], removed: [], changed: [{ id: 'cal', fields: ['periods'] }] })
  assert.deepEqual(comparison.input.dependencies.changed, [{ id: 'a-b', fields: ['lag'] }, { id: 'b-c', fields: ['type'] }])
  // Lag and link type changes are not task edits: every task whose dates changed is a consequence.
  assert.deepEqual(comparison.result.editedTaskIds, [])
  assert.deepEqual(comparison.result.consequenceTaskIds, ['b', 'c'])
})

test('a cyclic candidate is reported as such, without throwing, and the input diff is still returned', () => {
  const current = chain()
  const candidate = { ...current, dependencies: [...current.dependencies, link('c', 'a')] }
  const comparison = comparePlans({ input: current }, { input: candidate })
  assert.equal(comparison.result.state.current.status, 'scheduled')
  assert.equal(comparison.result.state.candidate.status, 'cycle')
  assert.deepEqual(comparison.result.state.candidate.cycles[0].taskIds.toSorted(), ['a', 'b', 'c'])
  assert.equal(comparison.result.comparable, false)
  assert.deepEqual(comparison.input.dependencies.added, ['c-a'])
  assert.deepEqual(comparison.result.finish, { current: 6 })
  assert.deepEqual(comparison.result.tasks, [])
  assert.deepEqual(comparison.result.consequenceTaskIds, [])
  assert.equal(comparison.result.violations.candidate, undefined)
  assert.equal(comparison.empty, false)

  // An edited task of an unschedulable side is still listed, with no dates on that side.
  const edited = comparePlans({ input: current }, { input: withTask(candidate, 'd', { duration: 2 }) })
  assert.deepEqual(edited.result.tasks.map(entry => [entry.id, entry.current.state, entry.candidate.state]), [['d', 'scheduled', 'unscheduled']])
})

test('an infeasible side reports a deadline failure and has no finish', () => {
  const current = { ...chain(), deadline: 6 }
  const candidate = withTask(current, 'a', { duration: 4 })
  const comparison = comparePlans({ input: current }, { input: candidate })
  const failed = comparison.result.state.candidate
  assert.deepEqual([failed.status, failed.constraints, failed.deadline], ['infeasible', ['deadline'], true])
  assert.deepEqual(comparison.result.finish, { current: 6 })
  assert.deepEqual(comparison.result.editedTaskIds, ['a'])
  assert.equal(comparison.result.tasks[0].candidate.state, 'unscheduled')
  // Swapped: the failing side is the current plan.
  const back = comparePlans({ input: candidate }, { input: current })
  assert.equal(back.result.state.current.status, 'infeasible')
  assert.deepEqual(back.result.finish, { candidate: 6 })
  // Both failing the same way is not a difference.
  assert.equal(comparePlans({ input: candidate }, { input: candidate }).empty, true)
})

test('soft task deadlines are tracked as violations gained and lost', () => {
  const current = withTask(chain(), 'c', { deadline: 6 })
  const late = withTask(current, 'a', { duration: 4 })
  const gained = comparePlans({ input: current }, { input: late })
  assert.deepEqual(gained.result.violations.current, [])
  assert.deepEqual(gained.result.violations.gained, [{ code: 'deadline', taskId: 'c', deadline: 6, finish: 8 }])
  assert.deepEqual(gained.result.violations.lost, [])
  const lost = comparePlans({ input: late }, { input: current })
  assert.deepEqual(lost.result.violations.lost, [{ code: 'deadline', taskId: 'c', deadline: 6, finish: 8 }])
  // Moving a due time is a task edit.
  const moved = comparePlans({ input: current }, { input: withTask(current, 'c', { deadline: 7 }) })
  assert.deepEqual(moved.input.tasks.changed, [{ id: 'c', fields: ['deadline'] }])
  assert.throws(() => comparePlans({ input: withTask(current, 'c', { deadline: Infinity }) }, { input: current }), RangeError)
})

test('summary tasks roll up as consequences, and critical flag changes are reported', () => {
  const current = {
    range,
    tasks: [
      { id: 'phase', duration: 0 }, { id: 'x', parentId: 'phase', duration: 2 }, { id: 'y', parentId: 'phase', duration: 4 },
      { id: 'z', duration: 1 },
    ],
    dependencies: [link('phase', 'z')],
  }
  const candidate = withTask(current, 'x', { duration: 6 })
  const comparison = comparePlans({ input: current }, { input: candidate })
  assert.deepEqual(comparison.result.editedTaskIds, ['x'])
  assert.deepEqual(comparison.result.consequenceTaskIds, ['phase', 'y', 'z'])
  const phase = comparison.result.tasks.find(entry => entry.id === 'phase')
  assert.deepEqual(phase.current, { state: 'scheduled', start: 0, end: 4, critical: true, summary: true })
  assert.deepEqual(phase.candidate, { state: 'scheduled', start: 0, end: 6, critical: true, summary: true })
  const x = comparison.result.tasks.find(entry => entry.id === 'x')
  const y = comparison.result.tasks.find(entry => entry.id === 'y')
  assert.equal(x.critical, 'gained')
  assert.equal(y.critical, 'lost')
  // y keeps its dates; only its critical flag changed.
  assert.deepEqual([y.startShift, y.finishShift], [0, 0])
})

test('manual and inactive tasks', () => {
  const current = {
    range, tasks: [{ id: 'a', duration: 2 }, { id: 'm', duration: 0, manual: { start: 3, end: 5 } }, { id: 'i', duration: 1 }],
    dependencies: [link('a', 'm')],
  }
  const later = withTask(current, 'a', { duration: 4 })
  const comparison = comparePlans({ input: current }, { input: later })
  // The manual task keeps its dates: the link into it is now violated, not moved.
  assert.deepEqual(comparison.result.consequenceTaskIds, [])
  assert.deepEqual(comparison.result.violations.gained, [{ code: 'manual-conflict', taskId: 'm', dependencyId: 'a-m' }])

  const inactive = comparePlans({ input: current }, { input: withTask(current, 'i', { inactive: true }) })
  const i = inactive.result.tasks.find(entry => entry.id === 'i')
  assert.deepEqual([i.edited, i.fields, i.current.state, i.candidate], [true, ['inactive'], 'scheduled', { state: 'inactive' }])
  const same = comparePlans({ input: withTask(current, 'i', { inactive: true }) }, { input: withTask(current, 'i', { inactive: true }) })
  assert.equal(same.empty, true)
})

test('cumulative overload is summed per resource and a task in several resource rows is not counted twice', () => {
  const resources = [{ id: 'press', capacity: 1 }, { id: 'crew', capacity: 1 }]
  const current = {
    range,
    tasks: [{ id: 'A', duration: 4 }, { id: 'B', duration: 2 }, { id: 'C', duration: 2 }],
    resources,
    // A is shown in the press row and in the crew row; it is one task.
    assignments: [{ taskId: 'A', resourceId: 'press' }, { taskId: 'A', resourceId: 'crew' }, { taskId: 'B', resourceId: 'press' }, { taskId: 'C', resourceId: 'press', units: 2 }],
  }
  const comparison = comparePlans({ input: current }, { input: current })
  // press: [0, 2) load 4 (A 1 + B 1 + C 2) → excess 3 × 2; [2, 4) load 1 → none. crew: load 1 → none.
  assert.deepEqual(comparison.result.overload, [
    { resourceId: 'press', current: 6, candidate: 6, change: 0 },
    { resourceId: 'crew', current: 0, candidate: 0, change: 0 },
  ])
  // Move C to the crew, and give the press more capacity.
  const candidate = {
    ...current,
    resources: [{ id: 'press', capacity: 2 }, { id: 'crew', capacity: 1 }],
    assignments: [{ taskId: 'A', resourceId: 'press' }, { taskId: 'A', resourceId: 'crew' }, { taskId: 'B', resourceId: 'press' }, { taskId: 'C', resourceId: 'crew', units: 2 }],
  }
  const moved = comparePlans({ input: current }, { input: candidate })
  assert.deepEqual(moved.input.resources.changed, [{ id: 'press', fields: ['capacity'] }])
  assert.deepEqual(moved.input.assignments, {
    added: [{ taskId: 'C', resourceId: 'crew', units: 2 }], removed: [{ taskId: 'C', resourceId: 'press', units: 2 }], changed: [], taskIds: ['C'],
  })
  // press [0, 2): load 2, capacity 2 → 0. crew [0, 2): A 1 + C 2 = 3 → excess 2 × 2 = 4.
  assert.deepEqual(moved.result.overload, [
    { resourceId: 'press', current: 6, candidate: 0, change: -6 },
    { resourceId: 'crew', current: 0, candidate: 4, change: 4 },
  ])
  // C was reassigned: an edit, although its dates did not change.
  assert.deepEqual(moved.result.editedTaskIds, ['C'])
  const c = moved.result.tasks[0]
  assert.deepEqual([c.assignmentsChanged, c.fields, c.resourceIds], [true, [], { current: ['press'], candidate: ['crew'] }])
  // A units change is a changed assignment.
  const units = comparePlans({ input: current }, { input: { ...current, assignments: current.assignments.map(item => item.taskId === 'B' ? { ...item, units: 1 } : item) } })
  assert.deepEqual(units.input.assignments.changed, [])
  const twice = comparePlans({ input: current }, { input: { ...current, assignments: current.assignments.map(item => item.taskId === 'B' ? { ...item, units: 2 } : item) } })
  assert.deepEqual(twice.input.assignments.changed, [{ taskId: 'B', resourceId: 'press', fields: ['units'] }])
})

test('precomputed leveled results and load are used as given; overlapping load segments are rejected', () => {
  const input = {
    range, tasks: [{ id: 'a', duration: 4 }, { id: 'b', duration: 2 }],
    resources: [{ id: 'm', capacity: 1 }], assignments: [{ taskId: 'a', resourceId: 'm' }, { taskId: 'b', resourceId: 'm' }],
  }
  const leveled = levelResources(input)
  const comparison = comparePlans({ input }, { input, result: leveled })
  assert.deepEqual(comparison.input, emptyInput)
  // b moved; a kept its dates but is no longer critical.
  assert.deepEqual(comparison.result.consequenceTaskIds, ['a', 'b'])
  assert.deepEqual(comparison.result.tasks.map(entry => [entry.id, entry.startShift, entry.critical]), [['a', 0, 'lost'], ['b', 4, 'gained']])
  assert.deepEqual(comparison.result.overload, [{ resourceId: 'm', current: 2, candidate: 0, change: -2 }])
  const load = calculateResourceLoad(range, scheduleTasks(input).tasks, input.resources, input.assignments)
  assert.deepEqual(comparePlans({ input, load }, { input, load }).result.overload, [{ resourceId: 'm', current: 2, candidate: 2, change: 0 }])
  assert.throws(() => comparePlans({ input, load: [...load, load[0]] }, { input }), /Overlapping load segments of resource m/)
  assert.throws(() => comparePlans({ input, result: scheduleTasks({ ...input, tasks: [...input.tasks, { id: 'z', duration: 1 }] }) }, { input }),
    /names task z/)
})

test('input validation is descriptive and consistent with the scheduler', () => {
  const input = chain()
  assert.throws(() => comparePlans({ input: { ...input, tasks: [...input.tasks, { id: 'a', duration: 1 }] } }, { input }),
    { name: 'Error', message: 'Duplicate task ID: a (current plan)' })
  assert.throws(() => comparePlans({ input }, { input: { ...input, dependencies: [link('a', 'b'), link('a', 'b')] } }), { name: 'Error', message: 'Duplicate dependency ID: a-b (candidate plan)' })
  const resources = [{ id: 'm', capacity: 1 }]
  assert.throws(() => comparePlans({ input }, { input: { ...input, resources, assignments: [{ taskId: 'a', resourceId: 'm' }, { taskId: 'a', resourceId: 'm' }] } }),
    { name: 'Error', message: 'Duplicate assignment of task a to resource m (candidate plan)' })
  assert.throws(() => comparePlans({ input }, { input: { ...input, resources, assignments: [{ taskId: 'a', resourceId: 'x' }] } }), { name: 'Error', message: 'Unknown resource in assignment: x (candidate plan)' })
  assert.throws(() => comparePlans({ input }, { input: { ...input, resources, assignments: [{ taskId: 'q', resourceId: 'm' }] } }), { name: 'Error', message: 'Unknown task in assignment: q (candidate plan)' })
  assert.throws(() => comparePlans({ input }, { input: { ...input, resources: [...resources, ...resources] } }), { name: 'Error', message: 'Duplicate resource ID: m (candidate plan)' })
  assert.throws(() => comparePlans({ input }, undefined), { name: 'Error', message: 'A plan needs an input (candidate plan)' })
  assert.throws(() => comparePlans({ input, partial: 'yes' }, { input }), { name: 'Error', message: 'Invalid partial (current plan)' })
  // Invalid scheduling input throws the scheduler's own error, with the plan label.
  assert.throws(() => comparePlans({ input: withTask(input, 'a', { duration: -1 }) }, { input }), { name: 'RangeError', message: 'Invalid task duration: a (current plan)' })
})

test('partial plans make an incomplete comparison, and a moved base revision is stale', () => {
  const input = chain()
  const comparison = comparePlans({ input, revision: 'r2' }, { input, baseRevision: 'r1', partial: true })
  assert.equal(comparison.complete, false)
  assert.deepEqual(comparison.partial, { current: false, candidate: true })
  assert.deepEqual(comparison.revision, { current: 'r2', base: 'r1', stale: true })
  assert.deepEqual(comparePlans({ input, revision: 'r1' }, { input, baseRevision: 'r1' }).revision, { current: 'r1', base: 'r1', stale: false })
  assert.deepEqual(comparePlans({ input }, { input }).revision, { stale: false })
})

test('planComparisonTargets resolves tasks through bindings and gives before and after load ranges', () => {
  const current = { ...chain(), resources: [{ id: 'm', capacity: 1 }], assignments: [{ taskId: 'b', resourceId: 'm' }] }
  const comparison = comparePlans({ input: current }, { input: withTask(current, 'a', { duration: 4 }) })
  const index = buildViewBindingIndex(['a', 'b', 'c'].flatMap(id => [
    { entity: { kind: 'task', id }, target: { view: 'graph', kind: 'node', id } },
    { entity: { kind: 'task', id }, target: { view: 'timeline', kind: 'bar', id: 'bar-' + id } },
  ]))
  const all = planComparisonTargets(comparison, index)
  assert.deepEqual(all.entities.map(entity => entity.id), ['a', 'b', 'c'])
  assert.deepEqual(all.targets.filter(target => target.view === 'timeline').map(target => target.id), ['bar-a', 'bar-b', 'bar-c'])
  assert.deepEqual(all.load, [{ view: 'load', resourceId: 'm', start: 2, end: 5 }, { view: 'load', resourceId: 'm', start: 4, end: 7 }])
  const one = planComparisonTargets(comparison, index, { taskIds: ['c', 'zz'] })
  assert.deepEqual(one.targets, [{ view: 'graph', kind: 'node', id: 'c' }, { view: 'timeline', kind: 'bar', id: 'bar-c' }])
  assert.deepEqual(one.unknown, [{ kind: 'task', id: 'zz' }])
  assert.deepEqual(one.load, [])
})

test('planBaselines expresses the current plan as a baseline set', () => {
  const result = scheduleTasks(chain())
  const baselines = planBaselines(result, 'current')
  assert.deepEqual(baselines.get('b'), { id: 'current', start: 2, end: 5 })
  assert.equal(baselines.size, 4)
  assert.throws(() => planBaselines(result, '$baseline'), /Invalid baseline set ID/)
  assert.throws(() => planBaselines({ ok: false, code: 'cycle', cycles: [] }, 'current'), /successful schedule result/)
})

test('a long chain is compared without recursion', () => {
  const tasks = Array.from({ length: 3000 }, (_, i) => ({ id: 't' + i, duration: 1 }))
  const dependencies = tasks.slice(1).map((task, i) => link('t' + i, task.id))
  const current = { range: { start: 0, end: 10_000 }, tasks, dependencies }
  const comparison = comparePlans({ input: current }, { input: withTask(current, 't0', { duration: 2 }) })
  assert.equal(comparison.result.consequenceTaskIds.length, 2999)
})

test('a successful result must cover the task set of its input exactly', () => {
  const current = { range: { start: 0, end: 30 }, tasks: [{ id: 'a', duration: 2 }] }
  const candidate = { ...current, tasks: [...current.tasks, { id: 'b', duration: 12 }] }
  // A result calculated before task b was added is rejected instead of being compared as a complete plan.
  const stale = scheduleTasks(current)
  assert.throws(() => comparePlans({ input: current }, { input: candidate, result: stale }), {
    name: 'Error', message: 'The result has no entry for task b, an active task of its input; recalculate it from this input (candidate plan)',
  })
  const fresh = comparePlans({ input: current }, { input: candidate, result: scheduleTasks(candidate) })
  assert.equal(fresh.complete, true)
  assert.deepEqual(fresh.result.state.candidate, { status: 'scheduled', finish: 12 })
  assert.deepEqual(fresh.result.tasks.find(task => task.id === 'b').candidate, { state: 'scheduled', start: 0, end: 12, critical: true })

  // A removed task, a task listed twice and a result that is not a task list.
  assert.throws(() => comparePlans({ input: candidate }, { input: current, result: scheduleTasks(candidate) }),
    { name: 'Error', message: 'The result names task b, which is not an active task of its input (candidate plan)' })
  const twice = scheduleTasks(candidate)
  assert.throws(() => comparePlans({ input: candidate, result: { ...twice, tasks: [...twice.tasks, twice.tasks[0]] } }, { input: candidate }),
    { name: 'Error', message: 'The result lists task a more than once (current plan)' })
  assert.throws(() => comparePlans({ input: current, result: { ...stale, tasks: 'a' } }, { input: current }),
    { name: 'Error', message: 'Invalid schedule result (current plan)' })

  // Inactive tasks: a result calculated before b was deactivated, or before it was activated again, is rejected.
  const deactivated = withTask(candidate, 'b', { inactive: true })
  assert.throws(() => comparePlans({ input: current }, { input: deactivated, result: scheduleTasks(candidate) }),
    { name: 'Error', message: 'The result names task b, which is not an active task of its input (candidate plan)' })
  assert.throws(() => comparePlans({ input: current }, { input: deactivated, result: stale }),
    { name: 'Error', message: 'The result does not list task b as inactive, an inactive task of its input; recalculate it from this input (candidate plan)' })
  assert.throws(() => comparePlans({ input: current }, { input: candidate, result: scheduleTasks(deactivated) }),
    { name: 'Error', message: 'The result has no entry for task b, an active task of its input; recalculate it from this input (candidate plan)' })
  assert.throws(() => comparePlans({ input: current }, { input: candidate, result: { ...scheduleTasks(candidate), inactiveTaskIds: ['x'] } }),
    { name: 'Error', message: 'The result lists task x as inactive, which is not an inactive task of its input (candidate plan)' })
  const matching = comparePlans({ input: current }, { input: deactivated, result: scheduleTasks(deactivated) })
  assert.deepEqual(matching.result.tasks.find(task => task.id === 'b').candidate, { state: 'inactive' })

  // The subtasks of an inactive summary are inactive too.
  const nested = { range: { start: 0, end: 30 }, tasks: [{ id: 's', duration: 0, inactive: true }, { id: 'c', parentId: 's', duration: 1 }, { id: 'a', duration: 2 }] }
  assert.deepEqual(scheduleTasks(nested).inactiveTaskIds, ['s', 'c'])
  assert.equal(comparePlans({ input: nested, result: scheduleTasks(nested) }, { input: nested }).empty, true)
  assert.throws(() => comparePlans({ input: nested, result: { ...scheduleTasks(nested), inactiveTaskIds: ['s'] } }, { input: nested }),
    /does not list task c as inactive/)

  // A failed result lists no tasks and is checked for its shape only. A change that keeps the task IDs, such as a
  // longer duration, cannot be detected: the stale finish of 12 is compared as given.
  const cycle = { ok: false, code: 'cycle', cycles: [] }
  assert.equal(comparePlans({ input: current }, { input: candidate, result: cycle }).result.state.candidate.status, 'cycle')
  const longer = withTask(candidate, 'b', { duration: 20 })
  assert.equal(comparePlans({ input: current }, { input: longer, result: scheduleTasks(candidate) }).result.finish.candidate, 12)
})
