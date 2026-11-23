import assert from 'node:assert/strict'
import { test } from 'node:test'
import { scheduleTasks } from '@eightkk/vue-weave/core'
import { createScheduleModel, enumerateSchedules } from './helpers/schedule-model.mjs'
import { forAllPlans, randomPlan, tally } from './helpers/schedule-plans.mjs'

// A brute-force oracle for small plans: every combination of start times on the grid is tried against the documented
// constraints (helpers/schedule-model.mjs), and the expected earliest and latest dates are read off the set of valid
// schedules by definition, without any scheduling algorithm. Plans have 2 to 4 tasks on 8 to 16 ticks, all four link
// types with signed lags, calendars with gaps, pauses, every task bound, the project deadline and inactive tasks.

const small = { minTicks: 8, maxTicks: 16, minTasks: 2, maxTasks: 4, maxDuration: 4, linkChance: 0.55, alap: true, inactive: true }
const startsText = starts => JSON.stringify(Object.fromEntries(starts))

function checkAgainstEnumeration(input) {
  const model = createScheduleModel(input)
  if (model.leafIds.length === 0) return 'empty'
  const solutions = enumerateSchedules(model)
  const result = scheduleTasks(input)
  if (solutions.length === 0) {
    assert.equal(result.code, 'infeasible', 'no start combination is valid, but the engine returned ' + JSON.stringify(result))
    assert.equal(model.earliest().ok, false, 'oracle self-check: relaxation found a schedule that enumeration did not')
    return 'infeasible'
  }
  // The least valid schedule: the componentwise minimum, which must itself be valid (the lattice property).
  const ids = model.leafIds
  const least = new Map(ids.map(id => [id, Math.min(...solutions.map(s => s.get(id)))]))
  const leastDates = model.datesFor(least)
  assert.deepEqual(model.violations(leastDates), [], 'oracle self-check: the componentwise minimum ' + startsText(least) + ' is not valid')
  const relaxed = model.earliest()
  assert.deepEqual(relaxed.ok && startsText(relaxed.starts), startsText(least), 'oracle self-check: relaxation and enumeration disagree')

  assert.equal(result.ok, true, 'a valid schedule exists (' + startsText(least) + '), but the engine returned ' + JSON.stringify(result))
  const byId = new Map(result.tasks.map(item => [item.id, item]))
  const actual = new Map(ids.map(id => [id, byId.get(id).earliestStart ?? byId.get(id).start]))
  assert.equal(startsText(actual), startsText(least), 'earliest starts')
  for (const id of ids) {
    const item = byId.get(id)
    assert.equal(item.earliestEnd ?? item.end, leastDates.get(id).end, id + ': earliest end')
  }
  const finish = Math.max(...ids.map(id => leastDates.get(id).end))
  assert.equal(result.finish, finish, 'project finish')

  // The latest schedule: the componentwise maximum of the valid schedules that end by the earliest project finish.
  const inTime = solutions.filter(s => ids.every(id => model.place(id, s.get(id)).end <= finish))
  const greatest = new Map(ids.map(id => [id, Math.max(...inTime.map(s => s.get(id)))]))
  assert.deepEqual(model.violations(model.datesFor(greatest)), [], 'oracle self-check: the componentwise maximum ' + startsText(greatest) + ' is not valid')
  assert.equal(startsText(new Map(ids.map(id => [id, byId.get(id).latestStart]))), startsText(greatest), 'latest starts')
  for (const id of ids) assert.equal(byId.get(id).latestEnd, model.place(id, greatest.get(id)).end, id + ': latest end')
  return solutions.length === 1 ? 'unique' : 'ok'
}

test('earliest and latest dates of small plans equal the extremes of all valid start combinations', () => {
  const outcomes = forAllPlans({
    name: 'brute-force oracle', seed: 70_000, count: 6_000,
    generate: rng => randomPlan(rng, small),
    check: checkAgainstEnumeration,
  })
  const counts = tally(outcomes)
  assert.ok(counts.ok >= 2_500 && counts.infeasible >= 500, 'outcomes ' + JSON.stringify(counts))
})

test('the oracle on plans that are dense in links and lags, on one calendar with many gaps', () => {
  const outcomes = forAllPlans({
    name: 'dense oracle', seed: 80_000, count: 4_000,
    generate: rng => {
      const input = randomPlan(rng, { ...small, linkChance: 0.9, bounds: false, deadline: false, pauses: false })
      // One calendar with a gap after every one or two working ticks, used by every task.
      const q = input.quantum, ticks = (input.range.end - input.range.start) / q
      const periods = []
      for (let k = rng.int(0, 1); k < ticks; k += rng.int(2, 3)) periods.push({ start: input.range.start + k * q, end: input.range.start + Math.min(ticks, k + rng.int(1, 2)) * q })
      return { ...input, calendars: [{ id: 'gaps', periods }], defaultCalendarId: 'gaps', tasks: input.tasks.map(({ calendarId, ...task }) => task) }
    },
    check: checkAgainstEnumeration,
  })
  assert.ok(tally(outcomes).ok >= 1_500, 'outcomes ' + JSON.stringify(tally(outcomes)))
})
