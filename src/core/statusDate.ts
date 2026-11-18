import {
  buildScheduleModel, checkStatusDate, isMapLike, limitsOf, lowerBounds, slotFor, summarySlot, targetFinish, topologicalOrder,
  withStartedSubtasks, type WorkClock,
} from './scheduleModel.js'
import { scheduleTasks, type ScheduleInput, type ScheduleResult, type ScheduleTask } from './scheduling.js'
import type { TimeRange } from './timeline.js'

/**
 * Reschedule a plan whose tasks have reported progress at a status date. The current dates are those of
 * `scheduleTasks(input)`; when that fails, its failure is returned. Progress is the completed share of each task's
 * working duration, from 0 to 1, and a task without an entry has progress 0. The rules:
 *
 * - Progress 1: the task keeps its current dates, even after the status date.
 * - Progress between 0 and 1: the done work is `progress × duration` rounded down to whole quanta. It stays where it
 *   is, from the current start; when that would carry it past the status date (the task is ahead of plan or started
 *   early), it is placed instead so that it ends at the status date. The remaining work is scheduled at or after the
 *   status date on the task's calendar, so the task is split when time remains between the two parts; the result
 *   reports both parts in `work`. A task whose done work rounds down to zero, and a milestone, is treated as not
 *   started.
 * - Progress 0: the task starts no earlier than the status date (in addition to its own bounds).
 *
 * A started or finished task is pinned at its start: `startNoEarlierThan`, `startNoLaterThan`, `fixedStart` and
 * `mode` no longer apply, because its start has happened, and neither do incoming FS and SS dependencies, which bound
 * the start. Incoming FF and SF dependencies, with their lag, still bound the finish of a partly done task: when its
 * remaining work would finish too early, the remaining work resumes later, and the gap after the done work grows.
 * A finished task ignores every incoming dependency. Finish bounds and outgoing dependencies still apply, so
 * successors follow the new finish. A kept link that cannot be met, for example because the required finish lies
 * after a `finishNoLaterThan`, the deadline or the horizon, makes the plan infeasible, and the failure names the
 * link. Unstarted tasks keep every bound and dependency; a `fixedStart` before the status date then makes the plan
 * infeasible, which is returned as such. Returns the result of scheduling the adjusted plan; the dependencies that
 * no longer apply are left out of it, so they never appear in `criticalDependencyIds`. The input is not modified.
 *
 * Manual tasks keep their manual dates whatever their progress, and inactive tasks stay inactive; progress entries of
 * both are accepted and have no effect. Summary tasks roll up from their subtasks; their progress entries are accepted
 * and have no effect. A started subtask no longer inherits the start bounds of its summaries (links into a summary
 * and its `startNoEarlierThan`), for the same reason as its own.
 *
 * Throws a RangeError for a status date that is not finite, outside `input.range` or not aligned with the quantum,
 * a progress value outside 0..1 or a done share that does not fit before the status date, and an Error for a progress
 * that is not a Map and a progress entry of an unknown task.
 */
export function rescheduleFromStatusDate(
  input: ScheduleInput, statusDate: number, progress: ReadonlyMap<string, number>,
): ScheduleResult {
  const model = buildScheduleModel(input)
  checkStatusDate(model, statusDate)
  if (!isMapLike(progress)) {
    throw new Error('Progress must be a Map from task ID to the completed share, such as new Map([[\'a\', 0.5]])')
  }
  for (const [id, value] of progress) {
    if (!model.tasks.has(id) && !model.inactive.has(id)) throw new Error('Unknown task in progress: ' + id)
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) {
      throw new RangeError('Progress must be between zero and one: ' + id)
    }
  }
  const base = scheduleTasks(input)
  if (!base.ok) return base
  const current = new Map(base.tasks.map(task => [task.id, task]))
  const completed = new Set<string>()
  const resumes = new Map<string, Resume>()
  const tasks = input.tasks.map((task): ScheduleTask => {
    const modelled = model.tasks.get(task.id)
    if (!modelled || modelled.manual || modelled.summary) return task
    const value = progress.get(task.id) ?? 0
    const { startNoEarlierThan, startNoLaterThan, fixedStart: _fixed, mode: _mode, ...rest } = task
    if (value === 1) {
      completed.add(task.id)
      return { ...rest, fixedStart: current.get(task.id)!.start }
    }
    // Floating-point noise must not drop a whole quantum; a value just below 1 still leaves one quantum to do.
    const done = modelled.duration > 0 ? Math.min(modelled.duration - 1, Math.floor(value * modelled.duration + 1e-9)) : 0
    if (done === 0) {
      const lower = startNoEarlierThan === undefined ? statusDate : Math.max(startNoEarlierThan, statusDate)
      return { ...task, startNoEarlierThan: lower }
    }
    const { clock } = modelled
    const statusWork = clock.workAt(statusDate)
    let doneStart = clock.workAt(current.get(task.id)!.start)
    if (doneStart + done > statusWork) doneStart = statusWork - done
    if (doneStart < 0) throw new RangeError('The done work does not fit before the status date: ' + task.id)
    const start = clock.dateAt(doneStart, false)
    const doneEnd = clock.dateAt(doneStart + done, true)
    resumes.set(task.id, { pauses: task.pauses ?? [], doneEnd, resume: statusWork, remaining: modelled.duration - done, clock })
    const pinned: ScheduleTask = { ...rest, fixedStart: start }
    if (doneEnd < statusDate) pinned.pauses = [...task.pauses ?? [], { start: doneEnd, end: statusDate } satisfies TimeRange]
    return pinned
  })
  // Links that bound the start of a started task no longer apply; FF and SF links still bound the finish of its
  // remaining work. No link into a completed task applies.
  const dependencies = (input.dependencies ?? []).filter(link =>
    !completed.has(link.to) && !(resumes.has(link.to) && !targetFinish(link)))
  const started = new Set([...completed, ...resumes.keys()])
  const adjusted = withStartedSubtasks({ ...input, tasks, dependencies }, started)
  return scheduleTasks(withStartedSubtasks({ ...input, tasks: delayRemainingWork(adjusted, resumes), dependencies }, started))
}

/** A partly done task: its own pauses, where its done work ends, its remaining work and its clock without the gap. */
interface Resume {
  pauses: readonly TimeRange[]
  doneEnd: number
  /** Work position on `clock` at the status date, where the remaining work resumes at the earliest. */
  resume: number
  remaining: number
  clock: WorkClock
}

/**
 * A started task is pinned at its start, so a kept FF or SF link cannot move it as a whole. Its remaining work is
 * delayed instead, by extending the pause after its done work until its finish meets every kept link. This forward
 * pass follows the earliest dates of `scheduleTasks` in dependency order and returns the tasks with the extended
 * pauses. It stops at the first task without a slot and at a finish that does not fit in the horizon; scheduling the
 * returned plan then reports that failure.
 */
function delayRemainingWork(adjusted: ScheduleInput, resumes: ReadonlyMap<string, Resume>): ScheduleTask[] {
  const tasks = [...adjusted.tasks]
  const model = buildScheduleModel(adjusted)
  if (![...resumes.keys()].some(id => model.tasks.get(id)!.incoming.length)) return tasks
  const sorted = topologicalOrder(model)
  if ('cycles' in sorted) return tasks
  const earliest = new Map<string, TimeRange>()
  for (const id of sorted.order) {
    const task = model.tasks.get(id)!
    if (task.summary) {
      earliest.set(id, summarySlot(task, earliest))
      continue
    }
    if (task.manual) {
      earliest.set(id, task.manual)
      continue
    }
    const bounds = lowerBounds(task, earliest)
    const pinned = resumes.get(id)
    if (pinned && task.incoming.length) {
      const required = bounds.endLower.reduce((value, bound) => bound.dependencyId ? Math.max(value, bound.value) : value, -Infinity)
      const { clock } = pinned
      const resume = Math.max(pinned.resume, clock.minFinishWork(required) - pinned.remaining)
      if (resume + pinned.remaining > clock.total) break
      const source = tasks[task.index]!
      if (resume > pinned.resume) {
        tasks[task.index] = { ...source, pauses: [...pinned.pauses, { start: pinned.doneEnd, end: clock.dateAt(resume, false) }] }
      }
      earliest.set(id, { start: source.fixedStart!, end: clock.dateAt(resume + pinned.remaining, true) })
      continue
    }
    const slot = slotFor(task.clock, task.duration, limitsOf(bounds), false)
    if (!slot) break
    earliest.set(id, slot)
  }
  return tasks
}
