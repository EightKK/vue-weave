import assert from 'node:assert/strict'
import { test } from 'node:test'
import { calculateResourceLoad, normalizeWorkPeriods } from '@eightkk/vue-weave/core'
import { seededRandom } from './helpers/seeded.mjs'

/** The original algorithm: every segment copies the active set. */
function referenceLoad(range, tasks, resources, assignments) {
  const segments = []
  for (const resource of resources) {
    const events = new Map()
    const at = time => {
      let event = events.get(time)
      if (!event) events.set(time, event = { starts: [], ends: [] })
      return event
    }
    at(range.start)
    at(range.end)
    for (const period of normalizeWorkPeriods(resource.periods ?? [range], range)) {
      at(period.start).capacity = resource.capacity
      at(period.end).capacity = 0
    }
    for (const assignment of assignments.filter(item => item.resourceId === resource.id)) {
      const task = tasks.find(item => item.id === assignment.taskId)
      for (const period of normalizeWorkPeriods(task.work, range)) {
        at(period.start).starts.push({ taskId: task.id, units: assignment.units ?? 1 })
        at(period.end).ends.push({ taskId: task.id, units: assignment.units ?? 1 })
      }
    }
    const times = [...events.keys()].sort((a, b) => a - b)
    const active = new Set()
    let load = 0, capacity = 0
    for (let i = 0; i < times.length - 1; i++) {
      const event = events.get(times[i])
      for (const { taskId, units } of event.ends) {
        load -= units
        active.delete(taskId)
      }
      for (const { taskId, units } of event.starts) {
        load += units
        active.add(taskId)
      }
      capacity = event.capacity ?? capacity
      segments.push({ resourceId: resource.id, start: times[i], end: times[i + 1], load, capacity,
        overload: Math.max(0, load - capacity), taskIds: [...active] })
    }
  }
  return segments
}

test('calculateResourceLoad shares taskIds arrays between segments with the same tasks and keeps the output', () => {
  // 2,000 tasks on one shared daily calendar, starting in ten batches ten days apart, each with 200 work slices.
  const day = 24, tasks = []
  for (let i = 0; i < 2000; i++) {
    const first = 10 * Math.floor(i / 200)
    tasks.push({ id: 't' + i, work: Array.from({ length: 200 }, (_, k) => ({ start: (first + k) * day + 8, end: (first + k) * day + 16 })) })
  }
  const range = { start: 0, end: 310 * day }
  const resources = [{ id: 'crew', capacity: 500, periods: Array.from({ length: 310 }, (_, d) => ({ start: d * day + 6, end: d * day + 18 })) }]
  const assignments = tasks.map(task => ({ resourceId: 'crew', taskId: task.id }))
  const started = performance.now()
  const segments = calculateResourceLoad(range, tasks, resources, assignments)
  const elapsed = performance.now() - started
  const arrays = new Set(segments.map(segment => segment.taskIds))
  let stored = 0
  for (const ids of arrays) stored += ids.length
  // Copying the active set per segment stored 400,000 IDs in over 1,000 arrays; shared arrays store each set once.
  assert.ok(stored <= 25_000 && arrays.size <= 25, `stored ${stored} task IDs in ${arrays.size} arrays`)
  assert.ok(elapsed < 2000, `took ${elapsed} ms`)
  const busiest = segments.reduce((best, segment) => segment.load > best.load ? segment : best)
  assert.equal(busiest.taskIds.length, busiest.load)
  assert.deepEqual(segments, referenceLoad(range, tasks, resources, assignments))
})

test('calculateResourceLoad output equals the copying algorithm on irregular data, including order', () => {
  const { random } = seededRandom(7)
  for (let round = 0; round < 20; round++) {
    const tasks = Array.from({ length: 12 }, (_, i) => ({
      id: 'x' + i,
      work: Array.from({ length: 1 + Math.floor(random() * 6) }, () => {
        const start = Math.floor(random() * 90)
        return { start, end: start + 1 + Math.floor(random() * 10) }
      }),
    }))
    const resources = [
      { id: 'a', capacity: 3 },
      { id: 'b', capacity: 2, periods: [{ start: 10, end: 40 }, { start: 45, end: 80 }] },
    ]
    const assignments = tasks.flatMap((task, i) => [
      { resourceId: 'a', taskId: task.id, units: 1 + (i % 3) },
      ...(i % 2 ? [{ resourceId: 'b', taskId: task.id }] : []),
    ])
    // Periodic repeats reuse memoized states.
    tasks.push({ id: 'p', work: Array.from({ length: 9 }, (_, k) => ({ start: k * 10, end: k * 10 + 5 })) })
    assignments.push({ resourceId: 'a', taskId: 'p' })
    const range = { start: 0, end: 100 }
    assert.deepEqual(calculateResourceLoad(range, tasks, resources, assignments), referenceLoad(range, tasks, resources, assignments))
  }
})
