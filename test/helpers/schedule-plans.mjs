// Random scheduling plans for the property tests, a greedy shrinker and a harness that reports the seed and the
// smallest failing plan. `npm test` runs test/*.test.mjs only, so this directory holds no tests.
import assert from 'node:assert/strict'
import { createPrng } from './prng.mjs'

const defaults = {
  minTicks: 20, maxTicks: 80, minTasks: 2, maxTasks: 9, maxDuration: 6, linkChance: 0.3,
  calendars: true, pauses: true, bounds: true, deadline: true, quanta: [1, 1, 2, 5],
  summaries: false, summaryChance: 0.5, manual: false, alap: false, inactive: false,
}

/** Periods of alternating work and time off over ticks [0, ticks), as tick pairs. */
function randomPeriods(rng, ticks) {
  const out = []
  let k = rng.chance(0.3) ? rng.int(1, 3) : 0
  while (k < ticks) {
    const end = Math.min(ticks, k + rng.int(1, 8))
    out.push([k, end])
    k = end + rng.int(1, 3)
  }
  return out
}

/**
 * A random plan. Dates are generated in ticks and then mapped to `origin + tick * quantum`, with a random quantum and
 * origin, so every plan also exercises alignment. Links go forward in a random topological order, so the link graph
 * is acyclic (summaries can still close a cycle through the hierarchy).
 */
export function randomPlan(rng, options = {}) {
  const o = { ...defaults, ...options }
  const ticks = rng.int(o.minTicks, o.maxTicks)
  const q = rng.pick(o.quanta)
  const origin = q * rng.int(-3, 3)
  const T = k => origin + k * q
  const range = { start: T(0), end: T(ticks) }
  const calendars = []
  if (o.calendars && rng.chance(0.7)) {
    const count = rng.int(1, 2)
    for (let i = 0; i < count; i++) calendars.push({ id: 'c' + i, periods: randomPeriods(rng, ticks).map(([s, e]) => ({ start: T(s), end: T(e) })) })
  }
  const count = rng.int(o.minTasks, o.maxTasks)
  const ids = rng.shuffle(Array.from({ length: count }, (_, i) => String.fromCharCode(97 + i)))
  const order = rng.shuffle(ids) // topological order of the links
  const tasks = ids.map(id => {
    const task = { id, duration: rng.chance(0.15) ? 0 : q * rng.int(1, o.maxDuration) }
    if (calendars.length && rng.chance(0.3)) task.calendarId = rng.pick(calendars).id
    if (o.pauses && task.duration > 0 && rng.chance(0.15)) {
      const s = rng.int(0, ticks - 1)
      task.pauses = [{ start: T(s), end: T(Math.min(ticks, s + rng.int(1, 4))) }]
    }
    if (o.bounds) {
      if (rng.chance(0.15)) task.startNoEarlierThan = T(rng.int(0, Math.floor(ticks / 2)))
      if (rng.chance(0.1)) task.startNoLaterThan = T(rng.int(Math.floor(ticks / 4), ticks))
      if (rng.chance(0.1)) task.finishNoEarlierThan = T(rng.int(0, Math.floor(ticks * 0.6)))
      if (rng.chance(0.1)) task.finishNoLaterThan = T(rng.int(Math.floor(ticks / 2), ticks))
      if (rng.chance(0.06)) task.fixedStart = T(rng.int(0, Math.floor(ticks / 2)))
    }
    if (o.alap && rng.chance(0.25)) task.mode = 'alap'
    if (o.manual && rng.chance(0.1)) {
      const s = rng.int(0, ticks - 1)
      task.manual = { start: T(s), end: T(Math.min(ticks, s + rng.int(0, 5))) }
    }
    if (o.inactive && rng.chance(0.08)) task.inactive = true
    return task
  })
  const byId = new Map(tasks.map(task => [task.id, task]))
  // Summaries: a few tasks adopt some of the tasks after them in input order (so parent IDs never form a cycle).
  if (o.summaries && rng.chance(o.summaryChance)) {
    const summaryCount = rng.int(1, 2)
    for (let s = 0; s < summaryCount; s++) {
      const index = rng.int(0, Math.max(0, tasks.length - 2))
      const summary = tasks[index]
      for (const child of tasks.slice(index + 1)) if (child.parentId === undefined && rng.chance(0.5)) child.parentId = summary.id
    }
    for (const task of tasks) {
      if (!tasks.some(other => other.parentId === task.id)) continue
      // Fields a summary may not have (they throw); the duration is ignored but kept.
      for (const key of ['fixedStart', 'startNoLaterThan', 'finishNoEarlierThan', 'manual', 'mode']) delete task[key]
    }
  }
  const isSummary = id => tasks.some(task => task.parentId === id)
  const descends = (id, ancestor) => {
    for (let parent = byId.get(id).parentId; parent !== undefined; parent = byId.get(parent).parentId) if (parent === ancestor) return true
    return false
  }
  const dependencies = []
  for (let i = 0; i < order.length; i++) {
    for (let j = i + 1; j < order.length; j++) {
      if (!rng.chance(o.linkChance)) continue
      const from = order[i], to = order[j]
      if (descends(from, to) || descends(to, from)) continue
      let type = rng.pick(['FS', 'FS', 'SS', 'FF', 'SF'])
      if (isSummary(to) && (type === 'FF' || type === 'SF')) type = type === 'FF' ? 'FS' : 'SS'
      const link = { id: 'l' + dependencies.length, from, to, type }
      if (rng.chance(0.5)) link.lag = q * rng.int(-3, 4)
      dependencies.push(link)
    }
  }
  const input = { range, quantum: q, tasks, dependencies }
  if (calendars.length) {
    input.calendars = calendars
    if (rng.chance(0.6)) input.defaultCalendarId = calendars[0].id
  }
  if (o.deadline && rng.chance(0.15)) input.deadline = T(rng.int(Math.floor(ticks * 0.6), ticks))
  return input
}

const optionalTaskFields = ['startNoEarlierThan', 'startNoLaterThan', 'finishNoEarlierThan', 'finishNoLaterThan', 'fixedStart',
  'mode', 'pauses', 'calendarId', 'manual', 'inactive', 'parentId', 'splittable', 'priority']

/** Smaller variants of a plan: without one task, one link, one assignment, one resource field or one task field. */
function* smallerPlans(input) {
  for (const task of input.tasks) {
    if (input.tasks.length <= 1) break
    const tasks = input.tasks.filter(other => other.id !== task.id)
      .map(other => other.parentId === task.id ? withField(other, 'parentId', task.parentId) : other)
    const touches = item => item.from === task.id || item.to === task.id
    yield {
      ...input, tasks, dependencies: (input.dependencies ?? []).filter(link => !touches(link)),
      ...(input.assignments ? { assignments: input.assignments.filter(a => a.taskId !== task.id) } : {}),
    }
  }
  for (const link of input.dependencies ?? []) yield { ...input, dependencies: input.dependencies.filter(other => other !== link) }
  for (const link of input.dependencies ?? []) if (link.lag) yield replaceItem(input, 'dependencies', link, withField(link, 'lag', undefined))
  for (const assignment of input.assignments ?? []) yield { ...input, assignments: input.assignments.filter(other => other !== assignment) }
  for (const task of input.tasks) {
    for (const key of optionalTaskFields) if (task[key] !== undefined) yield replaceItem(input, 'tasks', task, withField(task, key, undefined))
  }
  if (input.deadline !== undefined) yield withField(input, 'deadline', undefined)
  if (input.defaultCalendarId !== undefined) yield withField(input, 'defaultCalendarId', undefined)
  for (const resource of input.resources ?? []) {
    for (const key of ['periods', 'capacityPeriods']) if (resource[key]) yield replaceItem(input, 'resources', resource, withField(resource, key, undefined))
  }
}
function withField(object, key, value) {
  const copy = { ...object }
  if (value === undefined) delete copy[key]
  else copy[key] = value
  return copy
}
function replaceItem(input, key, item, replacement) {
  return { ...input, [key]: input[key].map(other => other === item ? replacement : other) }
}

/**
 * Greedily shrinks a failing plan: keeps any smaller variant on which `check` still fails with an assertion error
 * (variants that the library rejects with another error are skipped), until no variant fails.
 */
export function shrinkPlan(input, check) {
  const fails = candidate => {
    try {
      check(candidate)
      return false
    } catch (error) {
      return error instanceof assert.AssertionError
    }
  }
  let current = input
  for (let improved = true, rounds = 0; improved && rounds < 200; rounds++) {
    improved = false
    for (const candidate of smallerPlans(current)) {
      if (fails(candidate)) {
        current = candidate
        improved = true
        break
      }
    }
  }
  return current
}

/**
 * Runs `check(plan, rng)` on `count` plans made by `generate(rng)` from the seeds `seed`, `seed + 1`, … A failure is
 * rethrown with its seed and the smallest failing plan as compact JSON. Returns the per-case values `check` returned.
 */
export function forAllPlans({ name, seed, count, generate, check }) {
  const outcomes = []
  for (let i = 0; i < count; i++) {
    const caseSeed = seed + i
    const plan = generate(createPrng(caseSeed))
    try {
      outcomes.push(check(plan))
    } catch (error) {
      const minimal = shrinkPlan(plan, candidate => check(candidate))
      let minimalMessage = error.message
      try { check(minimal) } catch (minimalError) { minimalMessage = minimalError.message }
      throw new assert.AssertionError({
        message: name + ' failed for seed ' + caseSeed + ': ' + minimalMessage +
          '\nminimal plan: ' + JSON.stringify(minimal) + '\noriginal plan: ' + JSON.stringify(plan),
      })
    }
  }
  return outcomes
}

/** Counts of each value in a list, for asserting that a generator covers the interesting outcomes. */
export const tally = values => values.reduce((counts, value) => ({ ...counts, [value]: (counts[value] ?? 0) + 1 }), {})
