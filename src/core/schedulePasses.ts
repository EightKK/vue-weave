// Internal scheduling passes shared by scheduleTasks and levelResources. Not exported from the package entry points.
import {
  addSummaryUpper, addUpperBounds, cloneBounds, diagnose, limitsOf, manualSlot, slotFor, summaryUpper,
  type ScheduleModel, type Slot, type SummaryUpper,
} from './scheduleModel.js'
import { recordManualReason, recordSlotReasons, type ScheduleTraceRecorder } from './scheduleTrace.js'
import type { ScheduleFailure } from './scheduling.js'
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
