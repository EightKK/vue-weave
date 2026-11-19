import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildPlacementInput, calculateResourceLoad, levelResources, scheduleTasks } from 'vue-weave/core'
import { seededRandom } from './helpers/seeded.mjs'

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

// Summary tasks: leaving out an unplaced summary must not change what binds its placed subtasks.
const wide = { start: 0, end: 100 }
const datesOf = result => Object.fromEntries(result.tasks.map(item => [item.id, [item.start, item.end]]))

test('a placed subtask keeps the startNoEarlierThan and inactive state of its unplaced summary', () => {
  const input = { range: wide, tasks: [{ id: 'P', duration: 0, startNoEarlierThan: 10 }, { id: 'A', duration: 2, parentId: 'P' }] }
  const snapshot = JSON.stringify(input)
  assert.deepEqual(datesOf(scheduleTasks(input)), { P: [10, 12], A: [10, 12] })
  const placement = buildPlacementInput(input, ['A'])
  assert.equal(placement.ok, true)
  assert.deepEqual(placement.input.tasks, [{ id: 'A', duration: 2, startNoEarlierThan: 10 }])
  assert.deepEqual(datesOf(scheduleTasks(placement.input)), { A: [10, 12] })
  assert.equal('retargetedDependencies' in placement, false)
  assert.equal(JSON.stringify(input), snapshot)

  const off = {
    range: wide,
    tasks: [{ id: 'P', duration: 0, inactive: true }, { id: 'A', duration: 2, parentId: 'P' }, { id: 'B', duration: 1 }, { id: 'X', duration: 1 }],
    dependencies: [{ id: 'xa', from: 'X', to: 'A' }],
    assignments: [{ taskId: 'A', resourceId: 'R' }],
  }
  const full = scheduleTasks(off)
  assert.deepEqual([datesOf(full), full.inactiveTaskIds], [{ B: [0, 1], X: [0, 1] }, ['P', 'A']])
  const offPlacement = buildPlacementInput(off, ['A', 'B'])
  // A is inactive by inheritance, so the link from the unplaced X binds nothing and is no diagnostic.
  assert.equal(offPlacement.ok, true)
  assert.deepEqual(offPlacement.input.tasks, [{ id: 'A', duration: 2, inactive: true }, { id: 'B', duration: 1 }])
  assert.deepEqual(offPlacement.input.assignments, [{ taskId: 'A', resourceId: 'R' }])
  const scheduled = scheduleTasks(offPlacement.input)
  assert.deepEqual([datesOf(scheduled), scheduled.inactiveTaskIds], [{ B: [0, 1] }, ['A']])
})

test('bounds of several unplaced summaries combine, tightest wins, and a placed summary passes on its own', () => {
  const tasks = [
    { id: 'G', duration: 0, startNoEarlierThan: 20, finishNoLaterThan: 60 },
    { id: 'P', duration: 0, parentId: 'G', startNoEarlierThan: 10, finishNoLaterThan: 40 },
    { id: 'A', duration: 2, parentId: 'P', startNoEarlierThan: 5 },
    { id: 'B', duration: 2, parentId: 'P', startNoEarlierThan: 25, finishNoLaterThan: 30 },
  ]
  const input = { range: wide, tasks }
  assert.deepEqual(datesOf(scheduleTasks(input)), { G: [20, 27], P: [20, 27], A: [20, 22], B: [25, 27] })
  const placement = buildPlacementInput(input, ['A', 'B'])
  assert.deepEqual(placement.input.tasks, [
    { id: 'A', duration: 2, startNoEarlierThan: 20, finishNoLaterThan: 40 },
    { id: 'B', duration: 2, startNoEarlierThan: 25, finishNoLaterThan: 30 },
  ])
  assert.deepEqual(datesOf(scheduleTasks(placement.input)), { A: [20, 22], B: [25, 27] })
  // With P placed, P keeps A and B; only G's bounds move, and only its start is tighter than P's own.
  const middle = buildPlacementInput(input, ['P', 'A', 'B'])
  assert.deepEqual(middle.input.tasks, [{ id: 'P', duration: 0, startNoEarlierThan: 20, finishNoLaterThan: 40 }, tasks[2], tasks[3]])
  assert.equal(middle.input.tasks[1], tasks[2])
  assert.deepEqual(datesOf(scheduleTasks(middle.input)), { P: [20, 27], A: [20, 22], B: [25, 27] })
  // A partly placed subtree: G is placed and passes on its bounds itself; P's bounds move to A.
  const partial = buildPlacementInput({ range: wide, tasks: [...tasks, { id: 'C', duration: 1, parentId: 'G' }] }, ['G', 'A', 'C'])
  assert.deepEqual(partial.input.tasks, [
    tasks[0], { id: 'A', duration: 2, startNoEarlierThan: 10, parentId: 'G', finishNoLaterThan: 40 }, { id: 'C', duration: 1, parentId: 'G' },
  ])
  assert.deepEqual(datesOf(scheduleTasks(partial.input)), { G: [20, 22], A: [20, 22], C: [20, 21] })
})

test('an unmeetable finishNoLaterThan of an unplaced summary stays infeasible', () => {
  const input = {
    range: wide,
    tasks: [{ id: 'X', duration: 5 }, { id: 'P', duration: 0, finishNoLaterThan: 4 }, { id: 'A', duration: 2, parentId: 'P' }],
    dependencies: [{ id: 'xa', from: 'X', to: 'A' }],
  }
  const full = scheduleTasks(input)
  assert.deepEqual([full.ok, full.code, full.taskId, full.constraints], [false, 'infeasible', 'A', ['finishNoLaterThan']])
  const placed = scheduleTasks(buildPlacementInput(input, ['X', 'A']).input)
  assert.deepEqual([placed.ok, placed.code, placed.taskId, placed.constraints], [false, 'infeasible', 'A', ['finishNoLaterThan']])
})

test('a link from a placed task into an unplaced summary binds its placed leaf subtasks through retargeted links', () => {
  const input = {
    range: wide,
    tasks: [
      { id: 'X', duration: 5 }, { id: 'P', duration: 0 }, { id: 'A', duration: 2, parentId: 'P' }, { id: 'Q', duration: 0, parentId: 'P' },
      { id: 'B', duration: 1, parentId: 'Q' }, { id: 'C', duration: 4, parentId: 'Q' }, { id: 'D', duration: 3, parentId: 'P', inactive: true },
    ],
    dependencies: [{ id: 'xp', from: 'X', to: 'P' }, { id: 'xp@A', from: 'X', to: 'D' }, { id: 'xq', from: 'X', to: 'Q', type: 'SS', lag: 3 }],
  }
  const full = scheduleTasks(input)
  const placement = buildPlacementInput(input, ['X', 'A', 'B'])
  assert.equal(placement.ok, true)
  assert.deepEqual(placement.excludedDependencyIds, ['xp', 'xp@A', 'xq'])
  // IDs stay unique: the input already has a link `xp@A`. The inactive D and the unplaced C get no link.
  assert.deepEqual(placement.input.dependencies, [
    { id: 'xp@A#2', from: 'X', to: 'A' }, { id: 'xp@B', from: 'X', to: 'B' }, { id: 'xq@B', from: 'X', to: 'B', type: 'SS', lag: 3 },
  ])
  assert.deepEqual(placement.retargetedDependencies, [
    { id: 'xp@A#2', dependencyId: 'xp', summaryId: 'P', taskId: 'A' },
    { id: 'xp@B', dependencyId: 'xp', summaryId: 'P', taskId: 'B' },
    { id: 'xq@B', dependencyId: 'xq', summaryId: 'Q', taskId: 'B' },
  ])
  const scheduled = scheduleTasks(placement.input)
  for (const id of ['X', 'A', 'B']) assert.deepEqual(datesOf(scheduled)[id], datesOf(full)[id], id)
  assert.deepEqual(datesOf(scheduled), { X: [0, 5], A: [5, 7], B: [5, 6] })
  const original = new Map(placement.retargetedDependencies.map(item => [item.id, item.dependencyId]))
  assert.deepEqual(scheduled.criticalDependencyIds.map(id => original.get(id) ?? id), ['xp'])
  assert.deepEqual(full.criticalDependencyIds, ['xp'])

  // FF and SF links into a summary are invalid in the full plan; they are only excluded.
  const ff = buildPlacementInput({ ...input, dependencies: [{ id: 'xa', from: 'X', to: 'P', type: 'FF' }] }, ['X', 'A'])
  assert.deepEqual([ff.ok, ff.input.dependencies, ff.excludedDependencyIds, 'retargetedDependencies' in ff], [true, [], ['xa'], false])
})

test('a link from an unplaced task into an unplaced summary is a diagnostic for each placed leaf it binds', () => {
  const input = {
    range: wide,
    tasks: [
      { id: 'X', duration: 5 }, { id: 'P', duration: 0 }, { id: 'A', duration: 2, parentId: 'P' },
      { id: 'M', duration: 0, parentId: 'P', manual: { start: 1, end: 2 } }, { id: 'B', duration: 1, parentId: 'P' },
      { id: 'I', duration: 1, parentId: 'P', inactive: true },
    ],
    dependencies: [{ id: 'xp', from: 'X', to: 'P' }],
  }
  assert.deepEqual(datesOf(scheduleTasks(input)).A, [5, 7])
  const placement = buildPlacementInput(input, ['A', 'M', 'B', 'I'])
  assert.equal(placement.ok, false)
  // The manual M and the inactive I are not bound by the link in the full plan either.
  assert.deepEqual(placement.diagnostics, [
    { code: 'unplaced-predecessor', taskId: 'A', predecessorId: 'X', dependencyId: 'xp' },
    { code: 'unplaced-predecessor', taskId: 'B', predecessorId: 'X', dependencyId: 'xp' },
  ])
  assert.deepEqual(placement.input.dependencies, [])
})

test('a link from an unplaced summary is a link from an unplaced task', () => {
  const input = {
    range: wide,
    tasks: [{ id: 'P', duration: 0 }, { id: 'A', duration: 2, parentId: 'P' }, { id: 'B', duration: 6, parentId: 'P' }, { id: 'Y', duration: 1 }],
    dependencies: [{ id: 'py', from: 'P', to: 'Y' }],
  }
  assert.deepEqual(datesOf(scheduleTasks(input)).Y, [6, 7])
  const diagnostic = [{ code: 'unplaced-predecessor', taskId: 'Y', predecessorId: 'P', dependencyId: 'py' }]
  // Whether or not all subtasks are placed: the rolled-up dates of an unplaced summary are not part of the plan.
  for (const placed of [['A', 'Y'], ['A', 'B', 'Y']]) {
    const placement = buildPlacementInput(input, placed)
    assert.deepEqual([placement.ok, placement.diagnostics], [false, diagnostic])
  }
  // A summary whose subtasks are all inactive is inactive, so its links bind nothing.
  const off = { ...input, tasks: input.tasks.map(item => item.parentId ? { ...item, inactive: true } : item) }
  assert.deepEqual(buildPlacementInput(off, ['A', 'Y']).diagnostics, [])
})

test('an inactive summary above an unplaced active summary keeps the placed subtask out of the plan', () => {
  const input = {
    range: wide,
    tasks: [
      { id: 'G', duration: 0, inactive: true }, { id: 'P', duration: 0, parentId: 'G' }, { id: 'A', duration: 2, parentId: 'P' },
      { id: 'S', duration: 0, parentId: 'A' }, { id: 'Z', duration: 1 },
    ],
  }
  assert.deepEqual(scheduleTasks(input).inactiveTaskIds, ['G', 'P', 'A', 'S'])
  const placement = buildPlacementInput(input, ['A', 'S', 'Z'])
  // Only the topmost placed task is marked; the scheduler passes it down to S.
  assert.deepEqual(placement.input.tasks, [{ id: 'A', duration: 2, inactive: true }, input.tasks[3], input.tasks[4]])
  const scheduled = scheduleTasks(placement.input)
  assert.deepEqual([datesOf(scheduled), scheduled.inactiveTaskIds], [{ Z: [0, 1] }, ['A', 'S']])
  // A placed summary whose subtasks are all inactive and unplaced stays inactive as in the full plan.
  const empty = { range: wide, tasks: [{ id: 'P', duration: 4 }, { id: 'A', duration: 2, parentId: 'P', inactive: true }] }
  assert.deepEqual(scheduleTasks(empty).inactiveTaskIds, ['P', 'A'])
  assert.deepEqual(scheduleTasks(buildPlacementInput(empty, ['P']).input).inactiveTaskIds, ['P'])
})

// Seeded hierarchies with bounds and inactive summaries, links into and out of summaries, ALAP and manual subtasks.
// Some leaf subtasks are left unplaced, but only ones without links, so their durations are all that is lost; every
// summary keeps a placed leaf. The placement input must then schedule the placed tasks exactly like the full plan
// without those leaves and without the links reported as diagnostics (links out of unplaced summaries).
test('placement inputs of seeded hierarchies schedule like the full plan', () => {
  const { random, pick } = seededRandom(5112026)
  let compared = 0, retargets = 0, reported = 0, changed = 0
  for (let plan = 0; plan < 400; plan++) {
    const count = 4 + pick(11)
    const parents = []
    for (let i = 0; i < count; i++) parents.push(i > 0 && random() < 0.6 ? pick(i) : undefined)
    const children = new Map()
    parents.forEach((parent, i) => { if (parent !== undefined) children.set(parent, [...children.get(parent) ?? [], i]) })
    const subtree = i => {
      const out = [], stack = [i]
      while (stack.length) {
        for (const child of children.get(stack.pop()) ?? []) {
          out.push(child)
          stack.push(child)
        }
      }
      return out
    }
    const leavesOf = i => subtree(i).filter(j => !children.has(j))
    const id = i => 't' + i
    const index = taskId => Number(taskId.slice(1))
    const tasks = parents.map((parent, i) => {
      const item = { id: id(i), duration: pick(5) }
      if (parent !== undefined) item.parentId = id(parent)
      if (pick(4) === 0) item.startNoEarlierThan = pick(15)
      if (pick(6) === 0) item.finishNoLaterThan = 15 + pick(40)
      if (pick(12) === 0) item.inactive = true
      if (!children.has(i)) {
        const roll = pick(12)
        if (roll === 0) item.mode = 'alap'
        if (roll === 1) item.manual = { start: pick(10), end: 10 + pick(5) }
      }
      return item
    })
    // Loose leaves get no links and may be left unplaced.
    const loose = new Set(parents.map((_, i) => i).filter(i => !children.has(i) && pick(4) === 0))
    const dependencies = []
    for (let i = 0; i < count; i++) {
      for (let j = 0; j < count; j++) {
        if (i === j || loose.has(i) || loose.has(j) || pick(5)) continue
        const fromLeaves = children.has(i) ? leavesOf(i) : [i], toLeaves = children.has(j) ? leavesOf(j) : [j]
        // Acyclic: every leaf of the source comes before every leaf of the target, and no link inside one subtree.
        if (Math.max(...fromLeaves) >= Math.min(...toLeaves) || subtree(i).includes(j) || subtree(j).includes(i)) continue
        const types = children.has(j) ? ['FS', 'SS'] : ['FS', 'SS', 'FF', 'SF']
        dependencies.push({ id: 'l' + dependencies.length, from: id(i), to: id(j), type: types[pick(types.length)], lag: pick(4) - 1 })
      }
    }
    const input = { range: wide, tasks, dependencies }
    // Placement: each summary at random, every leaf that is not loose, and a loose leaf at random.
    const placedSet = new Set(parents.map((_, i) => i).filter(i => children.has(i) ? pick(2) === 0 : !loose.has(i) || pick(2) === 0))
    for (const summary of children.keys()) {
      const leaves = leavesOf(summary)
      if (!leaves.some(leaf => placedSet.has(leaf))) placedSet.add(leaves[0])
    }
    const placement = buildPlacementInput(input, [...placedSet].map(id))

    // The inactive state as documented: own flag, an inactive ancestor, or a summary without an active leaf.
    const off = new Set()
    for (let i = 0; i < count; i++) if (tasks[i].inactive || (parents[i] !== undefined && off.has(parents[i]))) off.add(i)
    for (const summary of children.keys()) if (leavesOf(summary).every(leaf => off.has(leaf))) off.add(summary)
    // Links out of an unplaced summary are diagnostics for what they bind among the placed tasks.
    const expectedDiagnostics = [], lost = new Set()
    for (const item of dependencies) {
      const from = index(item.from), to = index(item.to)
      if (!children.has(from) || placedSet.has(from)) continue
      lost.add(item.id)
      if (off.has(from) || off.has(to)) continue
      const targets = placedSet.has(to) ? [to] : children.has(to) ? leavesOf(to).filter(leaf => placedSet.has(leaf) && !off.has(leaf)) : []
      for (const target of targets) {
        if (!tasks[target].manual) expectedDiagnostics.push({ code: 'unplaced-predecessor', taskId: id(target), predecessorId: item.from, dependencyId: item.id })
      }
    }
    // In link order, then by placed task.
    const key = item => index(item.dependencyId) * 1000 + index(item.taskId)
    const sorted = list => [...list].sort((a, b) => key(a) - key(b))
    assert.deepEqual(sorted(placement.diagnostics), sorted(expectedDiagnostics), 'plan ' + plan)
    assert.equal(placement.ok, expectedDiagnostics.length === 0, 'plan ' + plan)
    reported += expectedDiagnostics.length
    retargets += placement.retargetedDependencies?.length ?? 0
    changed += placement.input.tasks.filter(item => !tasks.includes(item)).length

    const unplacedLeaves = new Set([...loose].filter(i => !placedSet.has(i)).map(id))
    const expected = scheduleTasks({
      range: wide, tasks: tasks.filter(item => !unplacedLeaves.has(item.id)), dependencies: dependencies.filter(item => !lost.has(item.id)),
    })
    const actual = scheduleTasks(placement.input)
    assert.notEqual(expected.code, 'cycle', 'plan ' + plan)
    assert.equal(actual.ok, expected.ok, 'plan ' + plan)
    if (!expected.ok) {
      assert.deepEqual([actual.code, actual.taskId, actual.constraints], [expected.code, expected.taskId, expected.constraints], 'plan ' + plan)
      continue
    }
    const expectedById = new Map(expected.tasks.map(item => [item.id, item]))
    const fields = value => [value.start, value.end, value.latestStart, value.latestEnd, value.totalFloat, value.critical]
    for (const item of actual.tasks) assert.deepEqual(fields(item), fields(expectedById.get(item.id)), 'plan ' + plan + ' task ' + item.id)
    assert.deepEqual(actual.tasks.map(item => item.id), expected.tasks.filter(item => placedSet.has(index(item.id))).map(item => item.id), 'plan ' + plan)
    assert.deepEqual(actual.inactiveTaskIds ?? [], (expected.inactiveTaskIds ?? []).filter(item => placedSet.has(index(item))), 'plan ' + plan)
    const original = new Map((placement.retargetedDependencies ?? []).map(item => [item.id, item.dependencyId]))
    const critical = [...new Set(actual.criticalDependencyIds.map(item => original.get(item) ?? item))]
    assert.deepEqual(critical.sort(), [...expected.criticalDependencyIds].sort(), 'plan ' + plan)
    compared++
  }
  // The corpus exercises every mechanism.
  assert.ok(compared > 200 && retargets > 50 && reported > 20 && changed > 50, JSON.stringify({ compared, retargets, reported, changed }))
})
