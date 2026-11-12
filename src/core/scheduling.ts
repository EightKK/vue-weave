import {
  addUpperBounds, buildScheduleModel, cloneBounds, diagnose, limitsOf, lowerBounds, slotFor, sourceFinish, targetFinish,
  topologicalOrder, type Slot,
} from './scheduleModel.js'
import type { WorkCalendar } from './workCalendar.js'
import type { TimeRange } from './timeline.js'
import type { TimelineDependency } from './types.js'

export interface ScheduleTask {
  id: string
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
  tasks: readonly ScheduledTask[]
  criticalDependencyIds: readonly string[]
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

/** Calculate earliest and latest feasible dates without changing the supplied plan. */
export function scheduleTasks(input: ScheduleInput): ScheduleResult {
  const model = buildScheduleModel(input)
  const { range, quantum, tasks } = model
  const dependencies = input.dependencies ?? []
  const sorted = topologicalOrder(model)
  if ('cycles' in sorted) return { ok: false, code: 'cycle', cycles: sorted.cycles }
  const { order } = sorted

  const earliest = new Map<string, Slot>()
  let finish = range.start
  for (const id of order) {
    const task = tasks.get(id)!
    const bounds = lowerBounds(task, earliest)
    const slot = slotFor(task.clock, task.duration, limitsOf(bounds), false)
    if (!slot) return diagnose(model, task, bounds)
    earliest.set(id, slot)
    finish = Math.max(finish, slot.end)
  }

  const latest = new Map<string, Slot>()
  for (let i = order.length - 1; i >= 0; i--) {
    const task = tasks.get(order[i]!)!
    const bounds = addUpperBounds(cloneBounds(task.bounds), task, latest, finish)
    const slot = slotFor(task.clock, task.duration, limitsOf(bounds), true)
    if (!slot) return diagnose(model, task, bounds)
    latest.set(task.id, slot)
  }

  // ALAP tasks consume only the float that moves no other task: successors keep their placed dates.
  const placed = new Map(earliest)
  for (let i = order.length - 1; i >= 0; i--) {
    const task = tasks.get(order[i]!)!
    if (!task.alap) continue
    const bounds = addUpperBounds(lowerBounds(task, earliest), task, placed, finish)
    const slot = slotFor(task.clock, task.duration, limitsOf(bounds), true)
    if (!slot) return diagnose(model, task, bounds)
    placed.set(task.id, slot)
  }

  const result = input.tasks.map(({ id }) => {
    const task = tasks.get(id)!
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
    return scheduled
  })
  const criticalIds = new Set(result.filter(task => task.critical).map(task => task.id))
  const criticalDependencyIds = dependencies.filter(link => {
    if (!criticalIds.has(link.from) || !criticalIds.has(link.to)) return false
    const from = earliest.get(link.from)!, to = earliest.get(link.to)!, task = tasks.get(link.to)!
    const lower = (sourceFinish(link) ? from.end : from.start) + (link.lag ?? 0)
    const end = targetFinish(link)
    const endpoint = end ? to.end : to.start
    if (lower < range.start) return false
    if (!task.duration) return lower === endpoint
    const work = end ? task.clock.minFinishWork(lower) : task.clock.workAt(lower)
    if (work > task.clock.total || (!end && work === task.clock.total)) return false
    return task.clock.dateAt(work, end) === endpoint
  }).map(link => link.id)
  return { ok: true, finish, tasks: result, criticalDependencyIds }
}
