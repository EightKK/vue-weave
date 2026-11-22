// Internal scheduling passes shared by scheduleTasks and levelResources. Not exported from the package entry points.
import {
  addManualUpper, addSummaryUpper, addUpperBounds, cloneBounds, diagnose, limitsOf, lowerBounds, manualSlot, rollUpSummaries,
  slotFor, sourceFinish, summarySlot, summaryUpper, targetFinish, topologicalOrder, type ScheduleModel, type Slot, type SummaryUpper,
} from './scheduleModel.js'
import {
  recordManualReason, recordSlotReasons, ScheduleTraceRecorder, type ExplainedScheduleResult,
} from './scheduleTrace.js'
import type {
  ScheduledTask, ScheduleFailure, ScheduleInput, ScheduleManualConflict, ScheduleResult, ScheduleSuccess,
} from './scheduling.js'
import type { TimeRange } from './timeline.js'

/**
 * The backward pass: the latest slot of every task in reverse topological `order` that keeps its successors and its
 * summaries' upper bounds feasible, given the `earliest` dates. With `finish`, no task may end after it (the project
 * finish of `scheduleTasks`; leveling passes none). With `trace`, the `latest` reasons are recorded, and `finishers`
 * names the tasks behind `finish`. Returns the failure of the first task without a slot.
 */
export function latestSlots(
  model: ScheduleModel, order: readonly string[], earliest: ReadonlyMap<string, TimeRange>, trace?: ScheduleTraceRecorder,
  finish?: number, finishers?: { parents: string[]; taskIds: string[] },
): Map<string, Slot> | ScheduleFailure {
  const { tasks } = model
  const latest = new Map<string, Slot>()
  // Upper bounds that summaries pass down to their subtasks; a summary comes before its subtasks in reverse order.
  const inherited = new Map<string, SummaryUpper>()
  for (let i = order.length - 1; i >= 0; i--) {
    const task = tasks.get(order[i]!)!
    if (task.summary) {
      inherited.set(task.id, summaryUpper(model, task, latest, inherited, earliest))
      continue
    }
    if (task.manual) {
      if (trace) recordManualReason(trace, 'latest', task)
      latest.set(task.id, manualSlot(task))
      continue
    }
    const bounds = addSummaryUpper(addUpperBounds(cloneBounds(task.bounds), task, latest, finish), task, inherited, earliest)
    const limits = limitsOf(bounds)
    const slot = slotFor(task.clock, task.duration, limits, true)
    if (!slot) return diagnose(model, task, bounds)
    if (trace) {
      recordSlotReasons(trace, 'latest', task, bounds, limits, slot, true, {
        linkParents: link => trace.ids('latest', link.to), finish: finishers, links: model.links,
      })
    }
    latest.set(task.id, slot)
  }
  return latest
}

/**
 * `scheduleTasks` on a model built from `input`. `rescheduleFromStatusDate` and `rescheduleFromActuals` build the model
 * with their started subtasks, and `propagateEdit` reuses the model it validated the edit with.
 */
export function scheduleWithModel(input: ScheduleInput, model: ScheduleModel, explain: boolean): ScheduleResult | ExplainedScheduleResult {
  const { range, quantum, tasks } = model
  const dependencies = input.dependencies ?? []
  const sorted = topologicalOrder(model)
  if ('cycles' in sorted) return { ok: false, code: 'cycle', cycles: sorted.cycles }
  const { order } = sorted
  const active = input.tasks.filter(task => tasks.has(task.id))
  const trace = explain ? new ScheduleTraceRecorder(active.map(task => task.id)) : undefined

  const earliest = new Map<string, Slot>()
  let finish = range.start
  for (const id of order) {
    const task = tasks.get(id)!
    if (task.summary) {
      earliest.set(id, summarySlot(task, earliest))
      continue
    }
    if (task.manual) {
      // Manual dates are kept as given; only the project deadline can make them infeasible.
      if (input.deadline !== undefined && task.manual.end > input.deadline) {
        return { ok: false, code: 'infeasible', taskId: id, constraints: ['deadline'], dependencyIds: [] }
      }
      if (trace) recordManualReason(trace, 'earliest', task)
      const slot = manualSlot(task)
      earliest.set(id, slot)
      finish = Math.max(finish, slot.end)
      continue
    }
    const bounds = lowerBounds(task, earliest)
    const limits = limitsOf(bounds)
    const slot = slotFor(task.clock, task.duration, limits, false)
    if (!slot) return diagnose(model, task, bounds)
    if (trace) {
      recordSlotReasons(trace, 'earliest', task, bounds, limits, slot, false, {
        linkParents: link => trace.ids('earliest', link.from),
      })
    }
    earliest.set(id, slot)
    finish = Math.max(finish, slot.end)
  }

  let finishers: { parents: string[]; taskIds: string[] } | undefined
  if (trace) {
    const taskIds = active.filter(task => !tasks.get(task.id)!.summary && earliest.get(task.id)!.end === finish).map(task => task.id)
    finishers = { taskIds, parents: taskIds.flatMap(id => trace.ids('earliest', id)) }
  }
  const backward = latestSlots(model, order, earliest, trace, finish, finishers)
  if (!(backward instanceof Map)) return backward
  const latest = backward

  // ALAP tasks consume only the float that moves no other task: successors keep their placed dates. A link into a
  // manual task holds an ALAP task back only when its earliest dates already meet it, so placement adds no conflict.
  const placed = new Map(earliest)
  const inheritedPlaced = new Map<string, SummaryUpper>()
  for (let i = order.length - 1; i >= 0; i--) {
    const task = tasks.get(order[i]!)!
    if (task.summary) {
      inheritedPlaced.set(task.id, summaryUpper(model, task, placed, inheritedPlaced, earliest, true))
      continue
    }
    if (!task.alap) continue
    const bounds = addSummaryUpper(addUpperBounds(lowerBounds(task, earliest), task, placed, finish), task, inheritedPlaced, earliest)
    addManualUpper(model, task, earliest.get(task.id)!, bounds.endUpper, bounds.startUpper)
    const limits = limitsOf(bounds)
    const slot = slotFor(task.clock, task.duration, limits, true)
    if (!slot) return diagnose(model, task, bounds)
    if (trace) {
      recordSlotReasons(trace, 'placement', task, bounds, limits, slot, true, {
        linkParents: link => trace.ids(tasks.get(link.to)!.alap ? 'placement' : 'earliest', link.to), finish: finishers,
        links: model.links,
      })
    }
    placed.set(task.id, slot)
  }
  if (model.leaves.length) {
    rollUpSummaries(model, order, placed)
    rollUpSummaries(model, order, latest)
  }

  // Summaries come after their children in `order`, so their float and critical flag roll up in one pass.
  const entries = new Map<string, ScheduledTask>()
  const floating = new Set<string>()
  for (const id of order) entries.set(id, scheduledEntry(id))
  function scheduledEntry(id: string): ScheduledTask {
    const task = tasks.get(id)!
    if (task.summary) {
      const plan = placed.get(id)!, late = latest.get(id)!
      let totalFloat = Infinity, workFloat = Infinity, critical = false
      for (const child of task.summary.children) {
        const entry = entries.get(child)!
        critical ||= entry.critical
        if (!floating.has(child)) continue
        totalFloat = Math.min(totalFloat, entry.totalFloat)
        workFloat = Math.min(workFloat, entry.workFloat)
      }
      if (totalFloat === Infinity) totalFloat = workFloat = 0
      else floating.add(id)
      return withParent(task.parent, {
        id, start: plan.start, end: plan.end, work: [], latestStart: late.start, latestEnd: late.end, totalFloat, workFloat,
        critical, summary: true,
      })
    }
    if (task.manual) {
      const { start, end } = task.manual
      const manual: ScheduledTask = {
        id, start, end, work: start < end ? task.clock.slices(task.manual) : [],
        latestStart: start, latestEnd: end, totalFloat: 0, workFloat: 0, critical: false, manual: true,
      }
      return withParent(task.parent, manual)
    }
    floating.add(id)
    const early = earliest.get(id)!, late = latest.get(id)!, plan = placed.get(id)!
    const totalFloat = task.duration === 0 ? late.start - early.start : (late.workStart - early.workStart) * quantum
    const workFloat = task.duration === 0
      ? (task.clock.workAt(late.start) - task.clock.workAt(early.start)) * quantum : totalFloat
    const scheduled: ScheduledTask = {
      id, start: plan.start, end: plan.end, work: task.duration ? task.clock.slices(plan) : [],
      latestStart: late.start, latestEnd: late.end, totalFloat, workFloat, critical: totalFloat === 0,
    }
    if (task.alap) {
      scheduled.earliestStart = early.start
      scheduled.earliestEnd = early.end
    }
    return withParent(task.parent, scheduled)
  }
  const result = active.map(({ id }) => entries.get(id)!)
  const criticalIds = new Set(result.filter(task => task.critical).map(task => task.id))
  /** The tasks a link binds: the target, or the active leaves of a summary target. */
  const targetsOf = (id: string) => {
    const summary = tasks.get(id)?.summary
    return summary ? model.leaves.slice(summary.first, summary.last) : [id]
  }
  const criticalDependencyIds = dependencies.filter(link => {
    if (!criticalIds.has(link.from) || !criticalIds.has(link.to)) return false
    const from = earliest.get(link.from)!
    const lower = (sourceFinish(link) ? from.end : from.start) + (link.lag ?? 0)
    if (lower < range.start) return false
    const end = targetFinish(link)
    return targetsOf(link.to).some(id => {
      if (!criticalIds.has(id)) return false
      const to = earliest.get(id)!, task = tasks.get(id)!
      const endpoint = end ? to.end : to.start
      if (!task.duration) return lower === endpoint
      const work = end ? task.clock.minFinishWork(lower) : task.clock.workAt(lower)
      if (work > task.clock.total || (!end && work === task.clock.total)) return false
      return task.clock.dateAt(work, end) === endpoint
    })
  }).map(link => link.id)
  const success: ScheduleSuccess = { ok: true, finish, tasks: result, criticalDependencyIds }
  const manualConflicts: ScheduleManualConflict[] = []
  for (const link of dependencies) {
    if (!tasks.has(link.from) || !tasks.has(link.to)) continue
    const from = placed.get(link.from)!
    const required = (sourceFinish(link) ? from.end : from.start) + (link.lag ?? 0)
    for (const id of targetsOf(link.to)) {
      const manual = tasks.get(id)!.manual
      if (manual && (targetFinish(link) ? manual.end : manual.start) < required) manualConflicts.push({ taskId: id, dependencyId: link.id })
    }
  }
  if (manualConflicts.length) success.manualConflicts = manualConflicts
  if (model.inactive.size) success.inactiveTaskIds = input.tasks.filter(task => model.inactive.has(task.id)).map(task => task.id)
  return trace ? { ...success, trace: trace.trace() } : success
}

/** A copy of a result entry with the `parentId` of its task, when it has one. */
function withParent(parentId: string | undefined, task: ScheduledTask): ScheduledTask {
  return parentId === undefined ? task : { ...task, parentId }
}
