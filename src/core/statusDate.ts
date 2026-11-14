import { buildScheduleModel } from './scheduleModel.js'
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
 * A started or finished task is pinned at its start: its incoming dependencies, `startNoEarlierThan`,
 * `startNoLaterThan`, `fixedStart` and `mode` no longer apply, because its start has happened. Its finish bounds and
 * its outgoing dependencies still apply, so successors follow the new finish. Unstarted tasks keep every bound and
 * dependency; a `fixedStart` before the status date then makes the plan infeasible, which is returned as such.
 * Returns the result of scheduling the adjusted plan; dependencies into started tasks are left out of it, so they
 * never appear in `criticalDependencyIds`. The input is not modified.
 *
 * Throws a RangeError for a status date that is not finite, outside `input.range` or not aligned with the quantum,
 * a progress value outside 0..1 or a done share that does not fit before the status date, and an Error for a progress
 * that is not a Map and a progress entry of an unknown task.
 */
export function rescheduleFromStatusDate(
  input: ScheduleInput, statusDate: number, progress: ReadonlyMap<string, number>,
): ScheduleResult {
  const model = buildScheduleModel(input)
  if (typeof statusDate !== 'number' || !Number.isFinite(statusDate)) throw new RangeError('The status date must be finite')
  if (statusDate < model.range.start || statusDate > model.range.end) throw new RangeError('The status date must be inside the schedule range')
  model.validateTime(statusDate)
  if (typeof progress?.get !== 'function' || typeof progress[Symbol.iterator] !== 'function') {
    throw new Error('Progress must be a Map from task ID to the completed share, such as new Map([[\'a\', 0.5]])')
  }
  for (const [id, value] of progress) {
    if (!model.tasks.has(id)) throw new Error('Unknown task in progress: ' + id)
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) {
      throw new RangeError('Progress must be between zero and one: ' + id)
    }
  }
  const base = scheduleTasks(input)
  if (!base.ok) return base
  const current = new Map(base.tasks.map(task => [task.id, task]))
  const started = new Set<string>()
  const tasks = input.tasks.map((task): ScheduleTask => {
    const value = progress.get(task.id) ?? 0
    const modelled = model.tasks.get(task.id)!
    const { startNoEarlierThan, startNoLaterThan, fixedStart: _fixed, mode: _mode, ...rest } = task
    if (value === 1) {
      started.add(task.id)
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
    started.add(task.id)
    const pinned: ScheduleTask = { ...rest, fixedStart: start }
    if (doneEnd < statusDate) pinned.pauses = [...task.pauses ?? [], { start: doneEnd, end: statusDate } satisfies TimeRange]
    return pinned
  })
  const dependencies = (input.dependencies ?? []).filter(link => !started.has(link.to))
  return scheduleTasks({ ...input, tasks, dependencies })
}
