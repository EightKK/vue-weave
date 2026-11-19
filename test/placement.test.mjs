import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildPlacementInput, calculateResourceLoad, levelResources, scheduleTasks } from 'vue-weave/core'

const range = { start: 0, end: 10 }

test('O08: placing Q without its predecessor P is diagnosed, not thrown or dropped silently', () => {
  const input = {
    range,
    tasks: [{ id: 'P', duration: 2 }, { id: 'Q', duration: 3 }],
    dependencies: [{ id: 'pq', from: 'P', to: 'Q' }],
    resources: [{ id: 'R1', capacity: 1 }],
    assignments: [{ taskId: 'P', resourceId: 'R1' }, { taskId: 'Q', resourceId: 'R1' }],
  }
  const snapshot = JSON.stringify(input)
  // The scheduler alone rejects the link to a task that is left out.
  assert.throws(() => scheduleTasks({ ...input, tasks: [input.tasks[1]] }), { name: 'Error', message: 'Unknown dependency endpoint: pq' })

  const placement = buildPlacementInput(input, ['Q'])
  assert.equal(placement.ok, false)
  assert.deepEqual(placement.diagnostics, [{ code: 'unplaced-predecessor', taskId: 'Q', predecessorId: 'P', dependencyId: 'pq' }])
  assert.deepEqual(placement.unplacedTaskIds, ['P'])
  assert.deepEqual(placement.excludedDependencyIds, ['pq'])
  assert.deepEqual(placement.excludedAssignments, [{ taskId: 'P', resourceId: 'R1' }])
  assert.deepEqual(placement.input, {
    range, tasks: [{ id: 'Q', duration: 3 }], dependencies: [],
    resources: [{ id: 'R1', capacity: 1 }], assignments: [{ taskId: 'Q', resourceId: 'R1' }],
  })
  // The filtered input is computable, so a preview can still show where Q would go.
  const schedule = scheduleTasks(placement.input)
  assert.deepEqual(schedule.tasks.map(task => [task.id, task.start, task.end]), [['Q', 0, 3]])
  assert.equal(levelResources(placement.input).ok, true)
  assert.deepEqual(calculateResourceLoad(range, schedule.tasks, placement.input.resources, placement.input.assignments)
    .map(segment => [segment.start, segment.end, segment.load]), [[0, 3, 1], [3, 10, 0]])
  assert.equal(JSON.stringify(input), snapshot)
})

test('placing a task with its predecessors keeps the links; links to unplaced successors are only excluded', () => {
  const input = {
    range,
    tasks: [{ id: 'P', duration: 2 }, { id: 'Q', duration: 3 }, { id: 'S', duration: 1 }],
    dependencies: [{ id: 'pq', from: 'P', to: 'Q' }, { id: 'qs', from: 'Q', to: 'S', type: 'SS' }],
  }
  const placement = buildPlacementInput(input, new Set(['P', 'Q']))
  assert.equal(placement.ok, true)
  assert.deepEqual(placement.diagnostics, [])
  assert.deepEqual(placement.unplacedTaskIds, ['S'])
  assert.deepEqual(placement.excludedDependencyIds, ['qs'])
  assert.deepEqual(placement.input.dependencies, [{ id: 'pq', from: 'P', to: 'Q' }])
  assert.equal('assignments' in placement.input, false)
  assert.deepEqual(scheduleTasks(placement.input).tasks.map(task => [task.id, task.start, task.end]), [['P', 0, 2], ['Q', 2, 5]])

  // Any link type reports its `from` task as the predecessor.
  assert.deepEqual(buildPlacementInput(input, ['S']).diagnostics, [
    { code: 'unplaced-predecessor', taskId: 'S', predecessorId: 'Q', dependencyId: 'qs' },
  ])
  assert.deepEqual(buildPlacementInput(input, []).input.tasks, [])
})

test('malformed placement input still throws', () => {
  const input = { range, tasks: [{ id: 'P', duration: 2 }, { id: 'Q', duration: 3 }], dependencies: [{ id: 'pq', from: 'P', to: 'Q' }] }
  assert.throws(() => buildPlacementInput({ ...input, tasks: [...input.tasks, input.tasks[0]] }, ['P']), { name: 'Error', message: 'Duplicate task ID: P' })
  assert.throws(() => buildPlacementInput(input, ['X']), /Unknown task to place: X/)
  assert.throws(() => buildPlacementInput(input, ['P', 'P']), /Duplicate task to place: P/)
  assert.throws(() => buildPlacementInput({ ...input, dependencies: [...input.dependencies, input.dependencies[0]] }, ['P']), { name: 'Error', message: 'Duplicate dependency ID: pq' })
  assert.throws(() => buildPlacementInput({ ...input, dependencies: [{ id: 'px', from: 'P', to: 'X' }] }, ['P']), /Unknown dependency endpoint: px/)
  assert.throws(() => buildPlacementInput({ ...input, assignments: [{ taskId: 'X', resourceId: 'R1' }] }, ['P']), /Unknown task in assignment: X/)
  assert.throws(() => buildPlacementInput({
    ...input, assignments: [{ taskId: 'Q', resourceId: 'R1' }, { taskId: 'Q', resourceId: 'R1' }],
  }, ['P']), { name: 'Error', message: 'Duplicate assignment of task Q to resource R1' })
})
