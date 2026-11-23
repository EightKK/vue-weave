import assert from 'node:assert/strict'
import { test } from 'node:test'
import { propagateEdit, rescheduleFromStatusDate, scheduleTasks } from '@eightkk/vue-weave/core'
import { deepFreeze } from './helpers/builders.mjs'
import { createScheduleModel } from './helpers/schedule-model.mjs'
import { forAllPlans, randomPlan, tally } from './helpers/schedule-plans.mjs'

// Property tests of scheduleTasks, propagateEdit and rescheduleFromStatusDate against the contract in
// docs/scheduling.md. Each case is a random plan from a fixed seed; a failure names its seed and the smallest plan that
// still fails. The expected earliest and latest dates come from the relaxation model in helpers/schedule-model.mjs,
// which knows nothing of the engine's passes.

const withoutTrace = ({ trace, ...rest }) => rest
const span = item => ({ start: item.start, end: item.end })
const full = { summaries: true, manual: true, alap: true, inactive: true }
const resultDates = result => new Map(result.tasks.map(item => [item.id, { start: item.start, end: item.end, work: item.work }]))
const withoutMode = input => ({ ...input, tasks: input.tasks.map(({ mode, ...task }) => task) })

/** Runs scheduleTasks on a frozen copy and checks determinism and that explain leaves the result alone. */
function schedule(input) {
  const result = scheduleTasks(deepFreeze(structuredClone(input)))
  assert.deepEqual(scheduleTasks(structuredClone(input)), result, 'the same input gave a different result')
  assert.deepEqual(withoutTrace(scheduleTasks(structuredClone(input), { explain: true })), result, 'explain changed the result')
  return result
}

/** The full check of one plan; returns the outcome ('ok', 'cycle' or 'infeasible'). */
function checkPlan(input) {
  const result = schedule(input)
  const model = createScheduleModel(input)
  if (model.cyclicGroups().length) {
    assert.equal(result.code, 'cycle', 'a cyclic plan was not reported as a cycle: ' + JSON.stringify(result))
    return 'cycle'
  }
  assert.notEqual(result.code, 'cycle', 'an acyclic plan was reported as a cycle')
  const early = model.earliest()
  if (!early.ok) {
    assert.equal(result.ok, false, 'no feasible schedule exists (task ' + early.taskId + ' has no slot), but the engine returned one')
    assert.equal(result.code, 'infeasible')
    assert.deepEqual(Object.keys(result).sort(), ['code', 'constraints', 'dependencyIds', 'ok', 'taskId'], 'a failure carries partial data')
    return 'infeasible'
  }
  assert.equal(result.ok, true, 'a feasible plan failed: ' + JSON.stringify(result) + '; a valid schedule is ' +
    JSON.stringify(Object.fromEntries([...early.dates].map(([id, d]) => [id, [d.start, d.end]]))))
  checkSuccess(input, model, early, result)
  return 'ok'
}

function checkSuccess(input, model, early, result) {
  const { info, q } = model
  assert.deepEqual(result.tasks.map(item => item.id), model.activeIds, 'tasks are not the active tasks in input order')
  const inactive = input.tasks.map(task => task.id).filter(id => !model.isActive(id))
  assert.deepEqual(result.inactiveTaskIds, inactive.length ? inactive : undefined, 'inactiveTaskIds')
  const byId = new Map(result.tasks.map(item => [item.id, item]))
  const placed = resultDates(result)
  // The finish of a plan without active tasks is not documented, so it is not checked.
  if (result.tasks.length) assert.equal(result.finish, Math.max(...result.tasks.map(item => item.end)), 'finish is not the latest end')

  // Dates: each leaf is where its start puts it on its calendar; a summary spans its leaves.
  for (const id of model.activeIds) {
    const item = byId.get(id), { task } = info.get(id)
    assert.equal(item.parentId, task.parentId, id + ': parentId')
    if (info.get(id).summary) {
      const leaves = info.get(id).leaves.map(leaf => byId.get(leaf))
      assert.equal(item.summary, true, id + ': summary flag')
      assert.deepEqual([item.start, item.end, item.work], [Math.min(...leaves.map(l => l.start)), Math.max(...leaves.map(l => l.end)), []], id + ': summary span')
      continue
    }
    assert.equal(item.summary, undefined, id + ': summary flag on a leaf')
    if (model.isManual(id)) {
      assert.deepEqual({ start: item.start, end: item.end, work: item.work }, model.manualDates(id), id + ': manual dates')
      assert.deepEqual([item.manual, item.latestStart, item.latestEnd, item.totalFloat, item.workFloat, item.critical],
        [true, item.start, item.end, 0, 0, false], id + ': manual task fields')
      continue
    }
    assert.deepEqual({ start: item.start, end: item.end, work: item.work }, model.place(id, item.start), id + ': dates do not match the calendar from its start')
    const earliest = early.dates.get(id)
    if (task.mode === 'alap') {
      assert.deepEqual([item.earliestStart, item.earliestEnd], [earliest.start, earliest.end], id + ': earliest dates of an ALAP task')
      assert.ok(item.start >= item.earliestStart, id + ': ALAP task placed before its earliest start')
    } else {
      assert.deepEqual([item.start, item.end], [earliest.start, earliest.end], id + ': not at the earliest feasible dates')
      assert.equal('earliestStart' in item, false, id + ': earliestStart on an ASAP task')
    }
  }

  // Every link and bound holds in the placed result; the manual conflicts are exactly the broken links into manual tasks.
  assert.deepEqual(model.violations(placed), [], 'the result breaks constraints')
  assert.deepEqual(result.manualConflicts ?? [], model.manualConflicts(placed), 'manualConflicts')
  if (result.manualConflicts) assert.ok(result.manualConflicts.length > 0, 'an empty manualConflicts list is present')

  // ALAP: no ALAP task could end later with every other task where it is. A link into a manual task binds it only
  // when its earliest dates already meet that link; a link from one of its summaries counts as its own, as links from
  // a summary bind its subtasks in the backward pass. As documented, an SS or SF link from a summary limits the start
  // of a subtask whose earliest start is the summary's earliest start, even where the summary's start would not move.
  for (const id of model.leafIds) {
    if (info.get(id).task.mode !== 'alap' || model.isManual(id)) continue
    const item = byId.get(id)
    const earliestDates = new Map(placed).set(id, early.dates.get(id))
    const own = [id, ...info.get(id).ancestors]
    const manualLinks = model.links.filter(entry => own.includes(entry.link.from) && entry.manualTargets.length)
    const held = manualLinks.filter(entry => model.manualConflicts(earliestDates).every(c => c.dependencyId !== entry.link.id))
    const startLinks = model.links.filter(entry => info.get(id).ancestors.includes(entry.link.from) &&
      (entry.type === 'SS' || entry.type === 'SF') && early.dates.get(id).start === early.dates.get(entry.link.from).start)
    for (const start of info.get(id).domain) {
      if (start <= item.start) continue
      const moved = model.place(id, start)
      if (moved.end > result.finish) break
      const dates = model.datesFor(new Map(model.leafIds.filter(l => !model.isManual(l)).map(l => [l, l === id ? start : placed.get(l).start])))
      const brokenManual = model.manualConflicts(dates).some(c => held.some(entry => entry.link.id === c.dependencyId))
      const brokenStart = startLinks.some(entry => [...entry.targets, ...(held.includes(entry) ? entry.manualTargets : [])].some(target =>
        start + entry.lag > (entry.type === 'SS' ? dates.get(target).start : dates.get(target).end)))
      if (model.violations(dates).length === 0 && !brokenManual && !brokenStart) assert.fail(id + ': ALAP task placed at ' + item.start + ' could start at ' + start)
    }
  }

  // Latest dates, float and the critical flag.
  const late = model.latest(early.dates, result.finish)
  assert.ok(late.ok, 'the model found no latest dates for task ' + late.taskId)
  assert.deepEqual(model.violations(late.dates), [], 'model self-check: the latest dates break a constraint')
  for (const id of model.activeIds) {
    if (model.isManual(id)) continue
    const item = byId.get(id)
    if (info.get(id).summary) {
      const leaves = info.get(id).leaves.map(leaf => byId.get(leaf))
      const automatic = leaves.filter(leaf => !leaf.manual)
      assert.deepEqual([item.latestStart, item.latestEnd], [Math.min(...leaves.map(l => l.latestStart)), Math.max(...leaves.map(l => l.latestEnd))], id + ': summary latest span')
      assert.equal(item.totalFloat, automatic.length ? Math.min(...automatic.map(l => l.totalFloat)) : 0, id + ': summary totalFloat')
      assert.equal(item.workFloat, automatic.length ? Math.min(...automatic.map(l => l.workFloat)) : 0, id + ': summary workFloat')
      assert.equal(item.critical, leaves.some(l => l.critical), id + ': summary critical')
      continue
    }
    const latest = late.dates.get(id), earliest = early.dates.get(id)
    assert.deepEqual([item.latestStart, item.latestEnd], [latest.start, latest.end], id + ': latest dates')
    const { working, calendarWorking, task } = info.get(id)
    const totalFloat = task.duration === 0 ? latest.start - earliest.start : q * model.workingTicksIn(working, earliest.start, latest.start)
    const workFloat = task.duration === 0 ? q * model.workingTicksIn(calendarWorking, earliest.start, latest.start) : totalFloat
    assert.deepEqual([item.totalFloat, item.workFloat, item.critical], [totalFloat, workFloat, totalFloat === 0], id + ': totalFloat, workFloat, critical')
  }
  const position = new Map((input.dependencies ?? []).map((link, i) => [link.id, i]))
  for (const [i, id] of result.criticalDependencyIds.entries()) {
    const link = input.dependencies[position.get(id)]
    assert.ok(byId.get(link.from)?.critical && byId.get(link.to)?.critical, id + ': critical link between tasks that are not both critical')
    if (i) assert.ok(position.get(result.criticalDependencyIds[i - 1]) < position.get(id), 'criticalDependencyIds out of input order')
  }

  // ALAP placement changes nothing but the placed dates of ALAP tasks (and the summaries that span them).
  if (input.tasks.some(task => task.mode === 'alap')) {
    const asap = scheduleTasks(withoutMode(input))
    assert.deepEqual([asap.finish, asap.criticalDependencyIds], [result.finish, result.criticalDependencyIds], 'ALAP changed the finish or the critical links')
    for (const [index, item] of result.tasks.entries()) {
      const plain = asap.tasks[index]
      const pick = t => [t.latestStart, t.latestEnd, t.totalFloat, t.workFloat, t.critical]
      assert.deepEqual(pick(item), pick(plain), item.id + ': ALAP changed latest dates, float or critical')
      if (item.earliestStart !== undefined) assert.deepEqual([item.earliestStart, item.earliestEnd], [plain.start, plain.end], item.id + ': earliest dates differ from ASAP')
      else if (!item.summary) assert.deepEqual([item.start, item.end, item.work], [plain.start, plain.end, plain.work], item.id + ': an ASAP task moved')
    }
  }
}

test('random plans: every result meets the documented contract and matches the relaxation model', () => {
  const outcomes = forAllPlans({
    name: 'contract', seed: 1_000, count: 1_500,
    generate: rng => randomPlan(rng, full),
    check: checkPlan,
  })
  const counts = tally(outcomes)
  // Guard against a generator that stops producing interesting plans.
  assert.ok(counts.ok >= 900 && counts.infeasible >= 150 && counts.cycle >= 20, 'outcomes ' + JSON.stringify(counts))
})

test('random plans without summaries, manual or inactive tasks: the same contract on plain dependency networks', () => {
  const outcomes = forAllPlans({
    name: 'plain contract', seed: 20_000, count: 1_000,
    generate: rng => randomPlan(rng, { alap: true, maxTasks: 12, linkChance: 0.35 }),
    check: checkPlan,
  })
  assert.ok(tally(outcomes).ok >= 500, 'outcomes ' + JSON.stringify(tally(outcomes)))
})

test('random plans that always have summary tasks: rollups, inherited bounds and links to and from summaries', () => {
  const outcomes = forAllPlans({
    name: 'summary contract', seed: 25_000, count: 800,
    generate: rng => randomPlan(rng, { summaries: true, summaryChance: 1, alap: true, minTasks: 4, maxTasks: 10, linkChance: 0.4 }),
    check: checkPlan,
  })
  assert.ok(tally(outcomes).ok >= 300, 'outcomes ' + JSON.stringify(tally(outcomes)))
})

test('a bound just before the earliest date makes a plan infeasible; one at the earliest date moves nothing', () => {
  let tightened = 0
  forAllPlans({
    name: 'tighten', seed: 30_000, count: 600,
    generate: rng => {
      const input = randomPlan(rng, full)
      return { ...input, pickIndex: rng.int(0, 1000), boundKind: rng.pick(['finishNoLaterThan', 'startNoLaterThan', 'deadline']) }
    },
    check: ({ pickIndex, boundKind, ...input }) => {
      const base = scheduleTasks(input)
      if (!base.ok) return
      const model = createScheduleModel(input)
      const candidates = model.leafIds.filter(id => !model.isManual(id))
      if (!candidates.length) return
      const id = candidates[pickIndex % candidates.length]
      const item = base.tasks.find(t => t.id === id)
      const earliest = { start: item.earliestStart ?? item.start, end: item.earliestEnd ?? item.end }
      const withBound = value => boundKind === 'deadline'
        ? { ...input, deadline: value }
        : { ...input, tasks: input.tasks.map(task => task.id === id ? { ...task, [boundKind]: value } : task) }
      const limit = boundKind === 'deadline' ? base.finish : boundKind === 'finishNoLaterThan' ? earliest.end : earliest.start
      tightened++
      const tight = scheduleTasks(withBound(limit - model.q))
      assert.equal(tight.code, 'infeasible', boundKind + ' of ' + (limit - model.q) + ' on ' + id + ' did not fail: ' + JSON.stringify(tight))
      if (boundKind !== 'deadline') {
        assert.equal(tight.taskId, id, 'the failure names another task')
        assert.ok(tight.constraints.includes(boundKind), 'the failure does not name ' + boundKind + ': ' + JSON.stringify(tight))
      } else {
        assert.ok(tight.constraints.includes('deadline'), 'the failure does not name the deadline: ' + JSON.stringify(tight))
      }
      const loose = scheduleTasks(withBound(limit))
      assert.equal(loose.ok, true, boundKind + ' at the earliest date failed: ' + JSON.stringify(loose))
      for (const [index, task] of loose.tasks.entries()) {
        const before = base.tasks[index]
        if (task.summary) continue // a summary spans placed (ALAP) dates, not earliest dates
        assert.deepEqual([task.earliestStart ?? task.start, task.earliestEnd ?? task.end], [before.earliestStart ?? before.start, before.earliestEnd ?? before.end], task.id + ': earliest dates moved')
      }
    },
  })
  assert.ok(tightened >= 300, 'only ' + tightened + ' plans were tightened')
})

test('a generated cycle is reported with exactly its strongly connected groups', () => {
  forAllPlans({
    name: 'cycles', seed: 40_000, count: 300,
    generate: rng => {
      const input = randomPlan(rng, { inactive: true, linkChance: 0.35, bounds: false })
      const ids = input.tasks.map(task => task.id)
      const extra = []
      for (let i = rng.int(1, 3); i > 0; i--) {
        const from = rng.pick(ids)
        extra.push({ id: 'back' + i, from, to: rng.chance(0.15) ? from : rng.pick(ids), type: rng.pick(['FS', 'SS', 'FF', 'SF']) })
      }
      return { ...input, dependencies: [...input.dependencies, ...extra] }
    },
    check: input => {
      const result = schedule(input)
      const model = createScheduleModel(input)
      const groups = model.cyclicGroups()
      if (!groups.length) return assert.notEqual(result.code, 'cycle')
      assert.deepEqual(result, {
        ok: false, code: 'cycle',
        cycles: groups.map(taskIds => ({
          taskIds,
          dependencyIds: model.links.filter(e => taskIds.includes(e.link.from) && taskIds.includes(e.link.to)).map(e => e.link.id),
        })),
      })
    },
  })
})

test('propagateEdit equals scheduleTasks on the documented edited copy and lists exactly the moved tasks', () => {
  const outcomes = forAllPlans({
    name: 'propagateEdit', seed: 50_000, count: 800,
    generate: rng => {
      const input = randomPlan(rng, full)
      const ticks = (input.range.end - input.range.start) / input.quantum
      const startTick = rng.int(0, ticks - 1)
      const edit = { pick: rng.int(0, 1000), start: input.range.start + startTick * input.quantum }
      if (rng.chance(0.4)) edit.end = edit.start + input.quantum * rng.int(0, Math.min(6, ticks - startTick))
      return { ...input, edit }
    },
    check: ({ edit: raw, ...input }) => {
      const model = createScheduleModel(input)
      const candidates = model.leafIds
      if (!candidates.length) return 'none'
      const id = candidates[raw.pick % candidates.length]
      const edit = raw.end === undefined ? { id, start: raw.start } : { id, start: raw.start, end: raw.end }
      const result = propagateEdit(deepFreeze(structuredClone(input)), edit)
      assert.deepEqual(propagateEdit(structuredClone(input), edit), result, 'propagateEdit is not deterministic')
      const task = model.info.get(id).task
      let edited
      if (model.isManual(id)) {
        const end = edit.end ?? edit.start + (task.manual.end - task.manual.start)
        if (end > model.R1) {
          assert.equal(result.ok, false)
          assert.deepEqual([result.code, result.taskId, result.constraints], ['infeasible', id, ['range']], 'a manual edit outside the range')
          return 'manual-range'
        }
        edited = { ...task, manual: { start: edit.start, end } }
      } else {
        edited = { ...task, fixedStart: edit.start }
        if (edit.end !== undefined) edited.duration = model.q * model.workingTicksIn(model.info.get(id).working, edit.start, edit.end)
      }
      const after = scheduleTasks({ ...input, tasks: input.tasks.map(t => t.id === id ? edited : t) })
      const before = scheduleTasks(input)
      if (!after.ok) return assert.deepEqual(result, after, 'the failure of the edited plan'), 'edited-fails'
      if (!before.ok) return assert.deepEqual(result, before, 'the failure of the unedited plan'), 'base-fails'
      assert.equal(result.ok, true)
      assert.deepEqual(result.schedule, after, 'the schedule differs from scheduleTasks on the edited copy')
      const changes = after.tasks.flatMap((item, index) => {
        const old = before.tasks[index]
        return old.start !== item.start || old.end !== item.end ? [{ id: item.id, before: span(old), after: span(item) }] : []
      })
      assert.deepEqual(result.changes, changes, 'changes')
      return 'ok'
    },
  })
  const counts = tally(outcomes)
  assert.ok(counts.ok >= 250 && counts['edited-fails'] >= 50, 'outcomes ' + JSON.stringify(counts))
})

test('propagateEdit rejects summary and inactive tasks with an Error', () => {
  const input = { range: { start: 0, end: 20 }, tasks: [{ id: 's', duration: 0 }, { id: 'a', duration: 2, parentId: 's' }, { id: 'x', duration: 1, inactive: true }] }
  assert.throws(() => propagateEdit(input, { id: 's', start: 1 }), Error)
  assert.throws(() => propagateEdit(input, { id: 'x', start: 1 }), Error)
})

test('rescheduleFromStatusDate: no progress adds the status date as a start bound; full progress keeps every date', () => {
  forAllPlans({
    name: 'status date', seed: 60_000, count: 600,
    generate: rng => {
      const input = randomPlan(rng, full)
      const ticks = (input.range.end - input.range.start) / input.quantum
      return { ...input, statusTick: rng.int(0, ticks - 1) }
    },
    check: ({ statusTick, ...input }) => {
      const statusDate = input.range.start + statusTick * input.quantum
      const model = createScheduleModel(input)
      const before = scheduleTasks(input)
      const none = rescheduleFromStatusDate(deepFreeze(structuredClone(input)), statusDate, new Map())
      if (!before.ok) return assert.deepEqual(none, before, 'the failure of the unadjusted plan')
      const bounded = {
        ...input,
        tasks: input.tasks.map(task => model.isActive(task.id) && !model.info.get(task.id).summary && !model.isManual(task.id)
          ? { ...task, startNoEarlierThan: Math.max(task.startNoEarlierThan ?? statusDate, statusDate) }
          : task),
      }
      const expected = scheduleTasks(bounded)
      if (expected.ok) assert.deepEqual(none, expected, 'progress 0 differs from a start bound at the status date')
      else assert.deepEqual([none.ok, none.code], [false, 'infeasible'], 'progress 0 should be infeasible: ' + JSON.stringify(none))

      const done = new Map(model.leafIds.map(id => [id, 1]))
      const kept = rescheduleFromStatusDate(input, statusDate, done)
      assert.equal(kept.ok, true, 'full progress failed: ' + JSON.stringify(kept))
      assert.deepEqual(kept.tasks.map(t => [t.id, t.start, t.end, t.work]), before.tasks.map(t => [t.id, t.start, t.end, t.work]), 'full progress moved a task')
    },
  })
})
