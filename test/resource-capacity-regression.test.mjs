import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { test } from 'node:test'
import * as core from 'vue-weave/core'

// Seeded plans mixing calendars, quanta, pauses, splittable, manual, inactive and summary tasks, priorities, several
// resources with and without availability `periods`, and assignment units. The digest was produced before
// `capacityPeriods` and partial assignments (`workOffset`, `workDuration`) were added; it must not change, because
// input without those fields is calculated exactly as before.
test('resource load, leveling and diagnostics without capacity periods or partial assignments are unchanged', () => {
  assert.equal(resourcePlanDigest(), 'ee5dec5eb6fae7bc71cd956b530db95a5a9465c5902f20ef225eb0a057a694a9')
})

function resourcePlanDigest() {
  let seed = 7302026
  const random = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648
  const pick = n => Math.floor(random() * n)
  const outputs = []
  const run = fn => {
    try {
      return fn()
    } catch (error) {
      return { error: error.constructor.name + ': ' + error.message }
    }
  }
  for (let plan = 0; plan < 300; plan++) {
    const quantum = pick(3) + 1
    const range = { start: 0, end: 160 * quantum }
    const periods = []
    for (let t = 0; t < range.end; t += 10 * quantum) periods.push({ start: t, end: t + (5 + pick(4)) * quantum })
    const calendar = pick(2) ? { calendars: [{ id: 'c', periods }], defaultCalendarId: 'c' } : {}
    const count = 3 + pick(10)
    const tasks = []
    for (let i = 0; i < count; i++) {
      const task = { id: 't' + i, duration: pick(6) * quantum }
      const roll = pick(14)
      if (roll === 0) task.startNoEarlierThan = pick(20) * quantum
      if (roll === 1) task.finishNoLaterThan = (60 + pick(60)) * quantum
      if (roll === 2) task.mode = 'alap'
      if (roll === 3) task.manual = { start: pick(10) * quantum, end: (10 + pick(10)) * quantum }
      if (roll === 4) task.inactive = true
      if (roll === 5 || roll === 6) task.pauses = [{ start: pick(10) * quantum, end: (10 + pick(3)) * quantum }]
      if (pick(4) === 0) task.splittable = true
      if (pick(3) === 0) task.priority = pick(4)
      tasks.push(task)
    }
    // Some plans group a few tasks under a summary task, which may itself be assigned.
    if (plan % 3 === 1) {
      tasks.push({ id: 'S', duration: 0 })
      for (let i = 0; i < count; i++) {
        const task = tasks[i]
        if (pick(3) === 0 && !task.manual && task.mode !== 'alap') task.parentId = 'S'
      }
      if (!tasks.some(task => task.parentId === 'S')) tasks.pop()
    }
    const ids = tasks.map(task => task.id)
    const dependencies = []
    for (let i = 0; i < count; i++) {
      for (let j = i + 1; j < count; j++) {
        if (pick(5)) continue
        dependencies.push({ id: 'l' + i + '-' + j, from: 't' + i, to: 't' + j, type: ['FS', 'SS', 'FF', 'SF'][pick(4)], lag: (pick(5) - 2) * quantum })
      }
    }
    if (plan % 40 === 7) dependencies.push({ id: 'back', from: 't' + (count - 1), to: 't0' })
    const resources = []
    const resourceCount = 1 + pick(3)
    for (let r = 0; r < resourceCount; r++) {
      const resource = { id: 'r' + r, capacity: pick(4) }
      if (pick(2)) {
        resource.periods = []
        for (let t = pick(5) * quantum; t < range.end; t += (20 + pick(10)) * quantum) {
          resource.periods.push({ start: t, end: t + (8 + pick(12)) * quantum })
        }
      }
      resources.push(resource)
    }
    const assignments = []
    for (const id of ids) {
      for (const resource of resources) {
        if (pick(3)) continue
        const assignment = { resourceId: resource.id, taskId: id }
        if (pick(3) === 0) assignment.units = 1 + pick(3)
        assignments.push(assignment)
      }
    }
    const input = { range, quantum, ...calendar, tasks, dependencies, resources, assignments }
    const schedule = run(() => core.scheduleTasks(input))
    const inactiveTaskIds = schedule.ok ? schedule.inactiveTaskIds ?? [] : []
    const load = schedule.ok
      ? run(() => core.calculateResourceLoad(range, schedule.tasks, resources, assignments, { inactiveTaskIds }))
      : undefined
    const leveled = run(() => core.levelResources(input, { explain: true }))
    const plain = run(() => core.levelResources(input))
    const diagnostics = run(() => core.toPlanningDiagnostics(leveled))
    const withLoad = schedule.ok && Array.isArray(load) ? run(() => core.toPlanningDiagnostics(schedule, load)) : undefined
    outputs.push([load, traced(leveled), plain, diagnostics, withLoad])
  }
  return createHash('sha256').update(JSON.stringify(outputs)).digest('hex')
}

function traced(result) {
  if (!result || !result.trace) return result
  return { ...result, trace: { reasons: result.trace.reasons, taskReasonIds: [...result.trace.taskReasonIds] } }
}

