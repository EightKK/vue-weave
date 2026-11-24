import assert from 'node:assert/strict'
import { test } from 'node:test'
import * as core from '@eightkk/vue-weave/core'
import { assertLevelingInvariants, assertScheduleInvariants, attempt, seededRandom, sha256Json, withPlainTrace } from './helpers/seeded.mjs'

// Seeded plans mixing calendars, quanta, pauses, splittable, manual, inactive and summary tasks, priorities, several
// resources with and without availability `periods`, and assignment units. The digest was produced before
// `capacityPeriods` and partial assignments (`workOffset`, `workDuration`) were added; it must not change, because
// input without those fields is calculated exactly as before. (It was updated once, when adjacent leveling `capacity`
// reasons of equal capacity were merged into one; every date, delay, overload and diagnostic stayed the same, and only
// the trace reasons and the reason IDs that diagnostics refer to changed.)
test('resource load, leveling and diagnostics without capacity periods or partial assignments are unchanged', () => {
  assert.equal(resourcePlanDigest(), '636894e1ec8f48afa6acbafa4b894cf1b987f7933272e641dafc719e08ece5eb')
})

function resourcePlanDigest() {
  const { pick } = seededRandom(7302026)
  const outputs = []
  const run = fn => attempt(fn, error => error.constructor.name + ': ' + error.message)
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
    assertScheduleInvariants(range, schedule, plan)
    assertLevelingInvariants(range, leveled, plan)
    assertLevelingInvariants(range, plain, plan)
    const diagnostics = run(() => core.toPlanningDiagnostics(leveled))
    const withLoad = schedule.ok && Array.isArray(load) ? run(() => core.toPlanningDiagnostics(schedule, load)) : undefined
    outputs.push([load, withPlainTrace(leveled), plain, diagnostics, withLoad])
  }
  return sha256Json(outputs)
}

// Seeded plans with many tasks per resource on shift calendars that run far past the work, so that the free time a
// task can use spans many working periods and lies behind long runs of reservations. The digest was produced by the
// build before leveling read capacity and free time only as far as each placement needs; it must not change.
test('leveling over long shift calendars with capacity periods and partial assignments is unchanged', () => {
  assert.equal(longHorizonDigest(), '2f233ee1944f78acce480d80456b9a21a44442e79f9124b048d3bb0c731af161')
})

function longHorizonDigest() {
  const { pick } = seededRandom(1124026)
  const outputs = []
  const run = fn => attempt(fn, error => error.constructor.name + ': ' + error.message)
  for (let plan = 0; plan < 60; plan++) {
    const quantum = 1 + pick(2), day = 24 * quantum, days = 30 + pick(90), half = Math.floor(days / 2)
    const origin = -pick(20) * day
    const range = { start: origin, end: origin + days * day }
    const at = (d, hour) => origin + d * day + hour * quantum
    const shifts = []
    for (let d = 0; d < days; d++) if (d % 7 < 5 || pick(10) === 0) shifts.push({ start: at(d, 8), end: at(d, [12, 16, 20][pick(3)]) })
    const calendars = [{ id: 'shift', periods: shifts }, { id: 'all', periods: [range] }]
    const count = 20 + pick(60), lanes = 1 + pick(8)
    const tasks = [], dependencies = []
    for (let i = 0; i < count; i++) {
      const task = { id: 't' + i, duration: (pick(20) === 0 ? 0 : 1 + pick(10)) * quantum }
      const roll = pick(20)
      if (roll === 0) task.calendarId = 'all'
      if (roll === 1) task.startNoEarlierThan = at(pick(half), 0)
      if (roll === 2) task.manual = { start: at(pick(half), 8), end: at(half + pick(half), 8) }
      if (roll === 3) task.finishNoLaterThan = at(half + pick(half), 0)
      if (roll === 4) task.inactive = true
      if (pick(4) === 0) task.splittable = true
      if (pick(3) === 0) task.priority = pick(4) - 1
      tasks.push(task)
      if (i >= lanes && pick(5)) {
        dependencies.push({ id: 'l' + i, from: 't' + (i - lanes), to: 't' + i, type: ['FS', 'FS', 'SS', 'FF', 'SF'][pick(5)], lag: (pick(7) - 2) * quantum })
      }
    }
    const resources = []
    for (let r = 0, n = 1 + pick(3); r < n; r++) {
      const resource = { id: 'r' + r, capacity: 1 + pick(2) }
      if (pick(3) === 0) resource.periods = shifts.filter(() => pick(5))
      if (pick(2)) {
        resource.capacityPeriods = []
        for (let t = origin + pick(100) * quantum; t < range.end; t += (1 + pick(200)) * quantum) {
          const end = Math.min(range.end, t + (1 + pick(100)) * quantum)
          resource.capacityPeriods.push({ start: t, end, capacity: pick(4) })
          t = end
        }
      }
      resources.push(resource)
    }
    const assignments = []
    for (const task of tasks) {
      for (const resource of resources) {
        if (resources.length > 1 && pick(resources.length)) continue
        const assignment = { resourceId: resource.id, taskId: task.id }
        if (pick(4) === 0) assignment.units = 1 + pick(2)
        if (pick(5) === 0) assignment.workOffset = pick(4) * quantum
        if (pick(5) === 0) assignment.workDuration = (1 + pick(4)) * quantum
        assignments.push(assignment)
      }
    }
    const input = { range, quantum, calendars, defaultCalendarId: 'shift', tasks, dependencies, resources, assignments }
    const leveled = run(() => core.levelResources(input, { explain: true }))
    const plain = run(() => core.levelResources(input))
    assertLevelingInvariants(range, leveled, plan)
    assertLevelingInvariants(range, plain, plan)
    outputs.push([withPlainTrace(leveled), plain, run(() => core.toPlanningDiagnostics(leveled))])
  }
  return sha256Json(outputs)
}

