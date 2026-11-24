import assert from 'node:assert/strict'
import { test } from 'node:test'
import { levelResources, scheduleTasks } from '@eightkk/vue-weave/core'
import { deepFreeze } from './helpers/builders.mjs'
import { createScheduleModel } from './helpers/schedule-model.mjs'
import { forAllPlans, randomPlan, tally } from './helpers/schedule-plans.mjs'

// Property tests of levelResources against "Level resources" and "Compare demand with capacity" in
// docs/scheduling.md. The load is recomputed here one tick at a time from the leveled work, independently of
// calculateResourceLoad, and the dates are checked with the constraint model of helpers/schedule-model.mjs.

const withoutMode = input => ({ ...input, tasks: input.tasks.map(({ mode, ...task }) => task) })
const span = item => ({ start: item.start, end: item.end })
const leveledOnly = ['leveledTasks', 'delays', 'overloads', 'unresolvedTaskIds', 'trace']
const scheduleFields = result => Object.fromEntries(Object.entries(result).filter(([key]) => !leveledOnly.includes(key)))

/** A random plan with resources, capacity periods, partial assignments, splittable tasks and priorities. */
function randomLevelingPlan(rng) {
  const input = randomPlan(rng, { summaries: true, manual: true, alap: true, inactive: true, maxTasks: 8 })
  const q = input.quantum, ticks = (input.range.end - input.range.start) / q
  const T = k => input.range.start + k * q
  const resources = Array.from({ length: rng.int(1, 3) }, (_, i) => {
    const resource = { id: 'r' + i, capacity: rng.int(1, 3) }
    if (rng.chance(0.25)) {
      resource.periods = []
      for (let k = rng.int(0, 2); k < ticks; k += rng.int(2, 12)) {
        const end = Math.min(ticks, k + rng.int(1, 10))
        resource.periods.push({ start: T(k), end: T(end) })
        k = end
      }
    }
    if (rng.chance(0.3)) {
      resource.capacityPeriods = []
      for (let k = rng.int(0, 10); k < ticks; k += rng.int(1, 15)) {
        const end = Math.min(ticks, k + rng.int(1, 8))
        resource.capacityPeriods.push({ start: T(k), end: T(end), capacity: rng.int(0, 4) })
        k = end
      }
    }
    return resource
  })
  const assignments = []
  for (const task of input.tasks) {
    if (rng.chance(0.25)) task.splittable = true
    if (rng.chance(0.2)) task.priority = rng.int(-2, 3)
    for (const resource of resources) {
      if (!rng.chance(0.45)) continue
      const assignment = { resourceId: resource.id, taskId: task.id }
      if (rng.chance(0.25)) assignment.units = rng.int(1, 3)
      if (rng.chance(0.15)) assignment.workOffset = q * rng.int(0, 3)
      if (rng.chance(0.15)) assignment.workDuration = q * rng.int(1, 3)
      assignments.push(assignment)
    }
  }
  return { ...input, resources, assignments }
}

/** Per resource and tick: capacity, demand and the tasks that demand it, from the scheduled work. */
function tickLoad(input, model, result) {
  const { q, tickCount, tickOf } = model
  const byId = new Map(result.tasks.map(item => [item.id, item]))
  const load = new Map()
  for (const resource of input.resources) {
    const capacity = Array.from({ length: tickCount }, (_, k) => {
      const t = model.time(k)
      if (resource.periods && !resource.periods.some(p => p.start <= t && t + q <= p.end)) return 0
      const period = (resource.capacityPeriods ?? []).find(p => p.start <= t && t + q <= p.end)
      return period ? period.capacity : resource.capacity
    })
    load.set(resource.id, { capacity, demand: new Array(tickCount).fill(0), tasks: Array.from({ length: tickCount }, () => []) })
  }
  for (const assignment of input.assignments) {
    const item = byId.get(assignment.taskId)
    if (!item || item.summary) continue
    const worked = item.work.flatMap(w => Array.from({ length: (w.end - w.start) / q }, (_, i) => tickOf(w.start) + i))
    const from = (assignment.workOffset ?? 0) / q
    const to = assignment.workDuration === undefined ? worked.length : from + assignment.workDuration / q
    const entry = load.get(assignment.resourceId)
    for (const k of worked.slice(from, to)) {
      entry.demand[k] += assignment.units ?? 1
      entry.tasks[k].push(assignment.taskId)
    }
  }
  return load
}

function checkLeveling(input) {
  const result = levelResources(deepFreeze(structuredClone(input)))
  assert.deepEqual(levelResources(structuredClone(input)), result, 'the same input gave a different result')
  const base = scheduleTasks(input)
  if (!base.ok) {
    assert.deepEqual(result, base, 'the failure of the unleveled plan is not returned unchanged')
    return base.code
  }
  assert.equal(result.ok, true, 'leveling a feasible plan failed: ' + JSON.stringify(result))
  const model = createScheduleModel(input)
  const unleveled = scheduleTasks(withoutMode(input))
  const before = new Map(unleveled.tasks.map(item => [item.id, item]))

  // leveledTasks: the input tasks without mode, with a raised start bound and added pauses only.
  const leveled = result.leveledTasks
  assert.deepEqual(leveled.map(t => t.id), input.tasks.map(t => t.id), 'leveledTasks are not the input tasks')
  for (const [index, task] of leveled.entries()) {
    const { mode, startNoEarlierThan, pauses, ...rest } = input.tasks[index]
    const { startNoEarlierThan: newStart, pauses: newPauses, ...newRest } = task
    assert.deepEqual(newRest, rest, task.id + ': leveledTasks changed other fields')
    if (startNoEarlierThan !== undefined) assert.ok(newStart >= startNoEarlierThan, task.id + ': a startNoEarlierThan was lowered')
    for (const pause of pauses ?? []) {
      assert.ok((newPauses ?? []).some(p => p.start <= pause.start && pause.end <= p.end) || coveredByAll(newPauses ?? [], pause, model.q), task.id + ': a pause was dropped')
    }
  }

  // The leveled plan is exactly what scheduleTasks makes of leveledTasks, as the guide promises.
  const replay = scheduleTasks({ ...input, tasks: leveled })
  assert.deepEqual(replay, scheduleFields(result), 'scheduleTasks(leveledTasks) does not reproduce the leveled plan')

  // Every bound and link of the input still holds (leveledTasks keep them, as checked above), and no task moved earlier.
  const leveledModel = createScheduleModel({ ...input, tasks: leveled })
  const placed = new Map(result.tasks.map(item => [item.id, { start: item.start, end: item.end, work: item.work }]))
  assert.deepEqual(leveledModel.violations(placed), [], 'the leveled plan breaks constraints')
  for (const item of result.tasks) {
    if (item.summary) continue
    if (!item.manual) assert.deepEqual({ start: item.start, end: item.end, work: item.work }, leveledModel.place(item.id, item.start), item.id + ': leveled dates do not match its calendar and pauses')
    assert.ok(item.start >= before.get(item.id).start, item.id + ': leveling moved a task earlier')
    if (item.manual) assert.deepEqual(span(item), span(before.get(item.id)), item.id + ': leveling moved a manual task')
  }

  // delays: exactly the tasks whose dates or work changed, in input order.
  const changed = result.tasks.filter(item => {
    const old = before.get(item.id)
    return !item.summary && (old.start !== item.start || old.end !== item.end || JSON.stringify(old.work) !== JSON.stringify(item.work))
  })
  assert.deepEqual(result.delays.map(d => d.taskId), changed.map(item => item.id), 'delays')
  const assigned = new Set(input.assignments.map(a => a.taskId))
  for (const delay of result.delays) {
    const item = changed.find(other => other.id === delay.taskId)
    assert.deepEqual([delay.before, delay.after, delay.delay], [span(before.get(item.id)), span(item), item.start - before.get(item.id).start], delay.taskId + ': delay entry')
    assert.ok(delay.cause === 'capacity' || delay.cause === 'predecessor', delay.taskId + ': cause')
    if (delay.cause === 'capacity') assert.ok(assigned.has(item.id) && item.end > item.start, delay.taskId + ': capacity cause without assignments or work')
    const task = model.info.get(item.id).task
    if (delay.pauses.length) assert.equal(task.splittable, true, delay.taskId + ': pauses added to a task that is not splittable')
  }

  // Capacity, recomputed per tick: no overload without an unresolved task, every overload involves one, and the
  // reported overload segments agree with the recomputed load.
  const unresolved = new Set(result.unresolvedTaskIds)
  assert.deepEqual(result.unresolvedTaskIds, result.tasks.map(t => t.id).filter(id => unresolved.has(id)), 'unresolvedTaskIds not in input order')
  const load = tickLoad(input, model, result)
  for (const [resourceId, { capacity, demand, tasks }] of load) {
    const segments = result.overloads.filter(segment => segment.resourceId === resourceId)
    for (let k = 0; k < model.tickCount; k++) {
      const excess = Math.max(0, demand[k] - capacity[k]), t = model.time(k)
      if (excess > 0) {
        assert.ok(tasks[k].some(id => unresolved.has(id)), resourceId + ' is overloaded at ' + t + ' by ' + tasks[k] + ', none of them unresolved')
      }
      const segment = segments.find(s => s.start <= t && t < s.end)
      assert.equal(segment?.overload ?? 0, excess, resourceId + ': reported overload at ' + t)
    }
  }
  if (unresolved.size === 0) assert.deepEqual(result.overloads, [], 'overloads without unresolved tasks')
  return unresolved.size ? 'unresolved' : result.delays.length ? 'leveled' : 'unchanged'
}

/** Whether the ticks of `pause` are all inside the union of `pauses`. */
function coveredByAll(pauses, pause, q) {
  for (let t = pause.start; t < pause.end; t += q) if (!pauses.some(p => p.start <= t && t + q <= p.end)) return false
  return true
}

test('levelResources: capacity holds, every bound and link holds, and scheduleTasks reproduces the leveled plan', () => {
  const outcomes = forAllPlans({ name: 'leveling', seed: 90_000, count: 2_000, generate: randomLevelingPlan, check: checkLeveling })
  const counts = tally(outcomes)
  assert.ok(counts.leveled >= 300 && counts.unresolved >= 200, 'outcomes ' + JSON.stringify(counts))
})

test('levelResources without assignments changes nothing but dropping mode', () => {
  forAllPlans({
    name: 'leveling without assignments', seed: 95_000, count: 400,
    generate: rng => ({ ...randomLevelingPlan(rng), assignments: [] }),
    check: input => {
      const result = levelResources(input)
      const plain = scheduleTasks(withoutMode(input))
      if (!plain.ok) return assert.deepEqual(result, scheduleTasks(input))
      assert.deepEqual(scheduleFields(result), plain)
      assert.deepEqual([result.delays, result.overloads, result.unresolvedTaskIds], [[], [], []])
    },
  })
})
