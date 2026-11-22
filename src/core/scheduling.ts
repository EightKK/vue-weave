import {
  addManualUpper, addSummaryUpper, addUpperBounds, buildScheduleModel, diagnose, limitsOf, lowerBounds, manualSlot,
  rollUpSummaries, slotFor, sourceFinish, summarySlot, summaryUpper, targetFinish, topologicalOrder, type Slot, type SummaryUpper,
} from './scheduleModel.js'
import {
  explainOption, recordManualReason, recordSlotReasons, ScheduleTraceRecorder, type ExplainedScheduleResult, type ScheduleOptions,
} from './scheduleTrace.js'
import { latestSlots } from './schedulePasses.js'
import type { WorkCalendar } from './workCalendar.js'
import type { TimeRange } from './timeline.js'
import type { TimelineDependency } from './types.js'

export interface ScheduleTask {
  id: string
  /**
   * Makes this task a subtask of the summary task with this ID. A task that other tasks name as their parent is a
   * summary task: its dates are the span of its subtasks and its own `duration`, `calendarId`, `pauses`, `splittable`
   * and `priority` are ignored. It cannot have `fixedStart`, `startNoLaterThan`, `finishNoEarlierThan`, `manual` or
   * `mode: 'alap'`. Its `startNoEarlierThan` and `finishNoLaterThan` apply to every subtask, and an inactive summary
   * makes all of its subtasks inactive. See "Summary tasks" in docs/scheduling.md.
   */
  parentId?: string
  duration: number
  calendarId?: string
  startNoEarlierThan?: number
  startNoLaterThan?: number
  finishNoEarlierThan?: number
  finishNoLaterThan?: number
  fixedStart?: number
  /**
   * Placement mode. `'alap'` places the task at the latest dates that move no other task
   * and keep the project finish. Defaults to `'asap'`.
   */
  mode?: 'asap' | 'alap'
  /** Elapsed half-open intervals in which this task does no work, in addition to its calendar's time off. */
  pauses?: readonly TimeRange[]
  /** Allows `levelResources` to interrupt the task's work. `scheduleTasks` ignores it. */
  splittable?: boolean
  /** Leveling priority; higher values are placed first. `scheduleTasks` ignores it. Defaults to 0. */
  priority?: number
  /**
   * Manually scheduled dates, like a manually scheduled task in Microsoft Project: the task stays at exactly
   * `[manual.start, manual.end)` in elapsed time. Its predecessors, own bounds, `mode` and calendar do not move it, and
   * `duration` is ignored; successors still follow it through their links. Both dates must align with the horizon and
   * quantum and lie inside `range`, with `end >= start`; equal dates make a milestone.
   */
  manual?: TimeRange
  /**
   * Leaves the task out of the calculation, like an inactive task in Microsoft Project: it, every dependency that
   * touches it and its resource assignments are ignored, and it is not in the result's `tasks`. It is still validated.
   */
  inactive?: boolean
}

export interface ScheduleLink extends TimelineDependency {
  /** Elapsed time. Negative values allow overlap. */
  lag?: number
}

export interface ScheduleInput {
  range: TimeRange
  quantum?: number
  calendars?: readonly WorkCalendar[]
  defaultCalendarId?: string
  tasks: readonly ScheduleTask[]
  dependencies?: readonly ScheduleLink[]
  deadline?: number
}

export interface ScheduledTask extends TimeRange {
  id: string
  work: readonly TimeRange[]
  latestStart: number
  latestEnd: number
  totalFloat: number
  /** Float in working time on the task's calendar. Unlike `totalFloat`, this is also working time for milestones. */
  workFloat: number
  critical: boolean
  /** Present only for `mode: 'alap'` tasks: the earliest start that `totalFloat` is measured from. */
  earliestStart?: number
  /** Present only for `mode: 'alap'` tasks: the earliest finish. */
  earliestEnd?: number
  /**
   * Present (true) only for tasks with `manual` dates. Their latest dates are their own dates, their float is 0 and
   * they are never critical.
   */
  manual?: true
  /**
   * Present (true) only for summary tasks. Their dates are the span of their subtasks' dates, their latest dates the
   * span of their subtasks' latest dates, `work` is empty, `totalFloat` and `workFloat` are the smallest of their
   * subtasks that are not manual (0 when every subtask is manual), and they are critical when a subtask is critical.
   */
  summary?: true
  /** The `parentId` of the input task. Present only for a subtask. */
  parentId?: string
}

/**
 * A link into a manual task that the task's manual dates violate. For a link into a summary task, each manual subtask
 * whose dates violate it is listed.
 */
export interface ScheduleManualConflict {
  /** The manual task. */
  taskId: string
  dependencyId: string
}

/** Names of the bounds that can make a task infeasible. `calendar` covers the task's working time after pauses. */
export type ScheduleConstraintName =
  | 'range' | 'startNoEarlierThan' | 'startNoLaterThan' | 'finishNoEarlierThan' | 'finishNoLaterThan'
  | 'fixedStart' | 'deadline' | 'projectFinish' | 'calendar'

/** A strongly connected group of tasks. Every listed dependency lies on at least one cycle. */
export interface ScheduleCycle {
  taskIds: readonly string[]
  dependencyIds: readonly string[]
}

export interface ScheduleSuccess {
  ok: true
  finish: number
  /** One entry per task in input order, without inactive tasks. */
  tasks: readonly ScheduledTask[]
  criticalDependencyIds: readonly string[]
  /**
   * Links into manual tasks whose manual dates violate them, measured against the predecessor's dates in `tasks`, in
   * link order. Present only when not empty.
   */
  manualConflicts?: readonly ScheduleManualConflict[]
  /** IDs of the inactive tasks of the input, in input order. Present only when not empty. */
  inactiveTaskIds?: readonly string[]
}

export type ScheduleFailure =
  | { ok: false; code: 'cycle'; cycles: readonly ScheduleCycle[] }
  | {
    ok: false
    code: 'infeasible'
    taskId: string
    /** Binding bounds of the task that conflict, in a fixed order. */
    constraints: readonly ScheduleConstraintName[]
    /** Binding dependencies of the task that conflict, in input order. */
    dependencyIds: readonly string[]
  }

export type ScheduleResult = ScheduleSuccess | ScheduleFailure

/**
 * Calculate earliest and latest feasible dates without changing the supplied plan. With `{ explain: true }`, a
 * successful result also has a `trace` of why each task got its dates; the dates themselves do not change.
 *
 * A task with `manual` dates keeps them in every pass; links into it bind nothing (they still count for cycles), and
 * each one its dates violate is listed in `manualConflicts`. A manual task that ends after the `deadline` makes the plan
 * infeasible. An `inactive` task, its links and its result entry are left out.
 *
 * Tasks with a `parentId` form a summary hierarchy: a summary task's dates roll up from its subtasks, a link into it
 * binds the start of every subtask, and a link from it uses its rolled-up dates.
 */
export function scheduleTasks(input: ScheduleInput, options?: ScheduleOptions & { explain?: false }): ScheduleResult
export function scheduleTasks(input: ScheduleInput, options: ScheduleOptions & { explain: true }): ExplainedScheduleResult
export function scheduleTasks(input: ScheduleInput, options?: ScheduleOptions): ScheduleResult | ExplainedScheduleResult
export function scheduleTasks(input: ScheduleInput, options?: ScheduleOptions): ScheduleResult | ExplainedScheduleResult {
  const explain = explainOption(options)
  const model = buildScheduleModel(input, explain)
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

/** A proposed new start, and optionally a new end, of one task for `propagateEdit`. */
export interface ScheduleEdit {
  id: string
  start: number
  /**
   * When supplied, the task's working duration becomes the working time in [start, end) on its calendar. For a manual
   * task, it is the new end of its manual dates.
   */
  end?: number
}

/** A task whose dates differ between two schedules. */
export interface ScheduleChange {
  id: string
  before: TimeRange
  after: TimeRange
}

export interface PropagateEditSuccess {
  ok: true
  /** The full schedule with the edited task pinned. */
  schedule: ScheduleSuccess
  /** Every task whose start or end differs from `scheduleTasks(input)`, in input order. */
  changes: ScheduleChange[]
}

export type PropagateEditResult = PropagateEditSuccess | ScheduleFailure

/**
 * Reschedule a plan after one task is moved or resized, for example to preview or apply a GanttChart edit together
 * with its downstream effects. The edited task gets `fixedStart` at the new start (replacing any fixed start it had)
 * and, with `end`, the working duration of [start, end) on its calendar; every other bound and dependency still
 * applies. A manual task gets new manual dates instead: the new start and `end`, or the new start and its previous
 * elapsed length; dates outside the range make the edited plan infeasible (`range`). Returns the new schedule and the
 * tasks whose dates changed, or the failure of the edited plan (or of the unedited plan when only that fails). Editing
 * an inactive, unknown or summary task throws an Error; edit the subtasks of a summary instead, and its rolled-up dates
 * follow them in `changes`. The input is not modified.
 */
export function propagateEdit(input: ScheduleInput, edit: ScheduleEdit): PropagateEditResult {
  const model = buildScheduleModel(input)
  const task = model.tasks.get(edit.id)
  if (!task) throw new Error((model.inactive.has(edit.id) ? 'Cannot edit an inactive task: ' : 'Unknown task: ') + edit.id)
  if (task.summary) throw new Error('Cannot edit summary task ' + edit.id + ': its dates roll up from its subtasks, so edit those instead')
  if (typeof edit.start !== 'number') throw new RangeError('An edited task needs a numeric start: ' + edit.id)
  model.validateTime(edit.start)
  let duration = task.source.duration
  if (edit.end !== undefined) {
    model.validateTime(edit.end)
    if (edit.end < edit.start) throw new RangeError('An edited task cannot end before it starts: ' + edit.id)
    if (!task.manual) duration = (task.clock.workAt(edit.end) - task.clock.workAt(edit.start)) * model.quantum
  }
  let edited: (item: ScheduleTask) => ScheduleTask = item => ({ ...item, fixedStart: edit.start, duration })
  if (task.manual) {
    const manual = { start: edit.start, end: edit.end ?? edit.start + task.manual.end - task.manual.start }
    if (manual.start < model.range.start || manual.end > model.range.end) {
      return { ok: false, code: 'infeasible', taskId: edit.id, constraints: ['range'], dependencyIds: [] }
    }
    edited = item => ({ ...item, manual })
  }
  const tasks = input.tasks.map(item => item.id === edit.id ? edited(item) : item)
  const schedule = scheduleTasks({ ...input, tasks })
  if (!schedule.ok) return schedule
  const base = scheduleTasks(input)
  if (!base.ok) return base
  const changes: ScheduleChange[] = []
  schedule.tasks.forEach((after, index) => {
    const before = base.tasks[index]!
    if (before.start !== after.start || before.end !== after.end) {
      changes.push({ id: after.id, before: { start: before.start, end: before.end }, after: { start: after.start, end: after.end } })
    }
  })
  return { ok: true, schedule, changes }
}

/** The `TimelineBar` fields that `scheduledBarFields` derives from a scheduled task. */
export interface ScheduledBarFields extends TimeRange {
  critical: boolean
  latestEnd: number
  /** Present only when the task works in more than one segment. */
  segments?: TimeRange[]
}

/**
 * Derive the GanttChart bar fields of a `scheduleTasks` result task: its dates, critical flag, latest finish for the
 * float line and, for work split by breaks or pauses, its work segments. Spread the result into a `TimelineBar`.
 */
export function scheduledBarFields(task: ScheduledTask): ScheduledBarFields {
  const { start, end, latestEnd } = task
  if (![start, end, latestEnd].every(Number.isFinite) || end < start || latestEnd < end) {
    throw new RangeError('A scheduled task needs finite ordered dates and a latest finish at or after its finish: ' + task.id)
  }
  const fields: ScheduledBarFields = { start, end, critical: Boolean(task.critical), latestEnd }
  if (task.work.length > 1) fields.segments = task.work.map(segment => ({ start: segment.start, end: segment.end }))
  return fields
}
