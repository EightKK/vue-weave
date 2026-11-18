import type { ScheduledTask } from './scheduling.js'
import type { TimeRange } from './timeline.js'
import { assertScheduleRange, normalizeWorkPeriods } from './workCalendar.js'
import { assignmentWorkRange, capacityPeriodsOf, capacitySteps, mergeWork, sliceWork } from './resourceCapacity.js'

/** A capacity that replaces a resource's `capacity` over a fixed half-open interval of elapsed time. */
export interface ResourceCapacityPeriod extends TimeRange {
  /** A nonnegative integer, like `ResourceCapacity.capacity`. */
  capacity: number
}

export interface ResourceCapacity {
  id: string
  capacity: number
  /** Working periods of the resource. Outside them its capacity is 0. Defaults to the whole range. */
  periods?: readonly TimeRange[]
  /**
   * Capacity that changes over time: inside a period, its `capacity` replaces `capacity`; outside every period,
   * `capacity` applies. Outside `periods` the capacity is still 0. The periods use absolute times, must not overlap
   * (adjacent periods are fine) and need integer endpoints with `end > start`. Omitted, the capacity is constant.
   */
  capacityPeriods?: readonly ResourceCapacityPeriod[]
}

export interface ResourceAssignment {
  resourceId: string
  taskId: string
  units?: number
  /**
   * Makes the assignment cover only part of the task's work: it starts after this much working time of the task, measured
   * along the task's scheduled `work` segments, in the units of the times (so pauses, calendar breaks and split segments
   * are skipped). A nonnegative integer; defaults to 0. The assignment moves with the task. A part that reaches beyond the
   * task's work is clipped to it, so an assignment that starts after the work ends takes no capacity.
   */
  workOffset?: number
  /** Working time the assignment covers from `workOffset`. A positive integer; defaults to the rest of the task's work. */
  workDuration?: number
}

export interface ResourceLoadSegment extends TimeRange {
  resourceId: string
  load: number
  capacity: number
  overload: number
  /**
   * Tasks with work in the segment. Segments with the same tasks may share one array, so treat it as read-only.
   */
  taskIds: readonly string[]
}

export interface ResourceLoadOptions {
  /**
   * Tasks whose assignments are ignored, for example a schedule's `inactiveTaskIds`. Their assignments still need a
   * known resource, positive integer units and no duplicate; the tasks must not be in `tasks`.
   */
  inactiveTaskIds?: Iterable<string>
}

/**
 * The elapsed periods in which an assignment needs its resource, given the `work` segments of its task: the whole work,
 * or for an assignment with `workOffset` or `workDuration` the matching part of the work, clipped to it. Throws a
 * RangeError for invalid work segments or offsets. The arguments are not modified.
 */
export function assignmentWorkPeriods(
  work: readonly TimeRange[], assignment: Pick<ResourceAssignment, 'taskId' | 'workOffset' | 'workDuration'>,
): TimeRange[] {
  const part = assignmentWorkRange(assignment)
  for (const period of work) {
    if (!Number.isSafeInteger(period.start) || !Number.isSafeInteger(period.end) || period.end <= period.start) {
      throw new RangeError('Working periods must have finite integer endpoints and positive length')
    }
  }
  const merged = mergeWork(work)
  return part ? sliceWork(merged, part.offset, part.duration) : merged
}

/** A set of active tasks in insertion order, with memoized successor states keyed by the change applied to it. */
interface ActiveTasks {
  ids: readonly string[]
  next?: Map<string, ActiveTasks>
}

interface LoadEvent {
  starts: { taskId: string; units: number }[]
  ends: { taskId: string; units: number }[]
  capacity?: number
}

/**
 * Compare scheduled work to capacity over half-open intervals. With `options.inactiveTaskIds`, the assignments of those
 * tasks take no capacity, so the full assignment list of a plan with inactive tasks can be passed unchanged.
 *
 * Segments split wherever the load or the capacity changes, including at the bounds of `capacityPeriods`, so each
 * segment's `capacity` and `overload` hold over its whole interval. An assignment with `workOffset` or `workDuration`
 * adds load only during its part of the task's work (see `assignmentWorkPeriods`).
 */
export function calculateResourceLoad(
  range: TimeRange,
  tasks: readonly Pick<ScheduledTask, 'id' | 'work'>[],
  resources: readonly ResourceCapacity[],
  assignments: readonly ResourceAssignment[],
  options: ResourceLoadOptions = {},
): ResourceLoadSegment[] {
  assertScheduleRange(range)
  const taskPeriods = new Map<string, TimeRange[]>()
  const taskWork = new Map<string, readonly TimeRange[]>()
  for (const task of tasks) {
    if (!task.id || taskPeriods.has(task.id)) throw new Error('Invalid or duplicate workload task: ' + task.id)
    taskPeriods.set(task.id, normalizeWorkPeriods(task.work, range))
    taskWork.set(task.id, task.work)
  }
  const inactive = new Set<string>()
  for (const id of options.inactiveTaskIds ?? []) {
    if (taskPeriods.has(id)) throw new Error('An inactive task cannot have workload: ' + id)
    inactive.add(id)
  }
  const byResource = new Map<string, Map<number, LoadEvent>>()
  function eventAt(events: Map<number, LoadEvent>, time: number) {
    let event = events.get(time)
    if (!event) events.set(time, event = { starts: [], ends: [] })
    return event
  }
  for (const resource of resources) {
    if (!resource.id || byResource.has(resource.id)) throw new Error('Invalid or duplicate resource: ' + resource.id)
    if (!Number.isSafeInteger(resource.capacity) || resource.capacity < 0) throw new RangeError('Invalid resource capacity: ' + resource.id)
    const capacityPeriods = capacityPeriodsOf(resource)
    const events = new Map<number, LoadEvent>()
    eventAt(events, range.start)
    eventAt(events, range.end)
    const availability = normalizeWorkPeriods(resource.periods ?? [range], range)
    for (const step of capacitySteps(resource.capacity, capacityPeriods, availability)) eventAt(events, step.time).capacity = step.capacity
    byResource.set(resource.id, events)
  }
  const assigned = new Map<string, Set<string>>()
  for (const assignment of assignments) {
    const { resourceId, taskId, units = 1 } = assignment
    const events = byResource.get(resourceId)
    let work = taskPeriods.get(taskId)
    if (!events) throw new Error('Unknown resource in assignment: ' + resourceId)
    if (!work && !inactive.has(taskId)) {
      throw new Error('Unknown task in assignment: ' + taskId + '. Tasks left out of a schedule result as inactive must be listed in options.inactiveTaskIds')
    }
    if (!Number.isSafeInteger(units) || units <= 0) throw new RangeError('Assignment units must be a positive integer')
    let seen = assigned.get(resourceId)
    if (!seen) assigned.set(resourceId, seen = new Set())
    if (seen.has(taskId)) throw new Error('Duplicate resource assignment for task: ' + taskId)
    seen.add(taskId)
    const part = assignmentWorkRange(assignment)
    // Offsets count from the start of the task's whole work, which may begin before the range.
    if (part && work) work = normalizeWorkPeriods(sliceWork(mergeWork(taskWork.get(taskId)!), part.offset, part.duration), range)
    for (const period of work ?? []) {
      eventAt(events, period.start).starts.push({ taskId, units })
      eventAt(events, period.end).ends.push({ taskId, units })
    }
  }

  const segments: ResourceLoadSegment[] = []
  // Segments share one taskIds array while their tasks (and order) are equal. The order of a set follows from its
  // previous order and the change, so a change applied to the same state is memoized; an empty set is one state.
  // This keeps the output small when many tasks share work slices or when only the capacity changes.
  const empty: ActiveTasks = { ids: [] }
  for (const [resourceId, events] of byResource) {
    const times = [...events.keys()].sort((a, b) => a - b)
    const active = new Set<string>()
    let state = empty
    let load = 0, capacity = 0
    for (let i = 0; i < times.length - 1; i++) {
      const time = times[i]!, event = events.get(time)!
      for (const { taskId, units } of event.ends) {
        load -= units
        active.delete(taskId)
      }
      for (const { taskId, units } of event.starts) {
        load += units
        active.add(taskId)
      }
      if (event.ends.length || event.starts.length) {
        const change = JSON.stringify([event.ends.map(item => item.taskId), event.starts.map(item => item.taskId)])
        state.next ??= new Map()
        let next = state.next.get(change)
        if (!next) state.next.set(change, next = active.size ? { ids: [...active] } : empty)
        state = next
      }
      if (!Number.isSafeInteger(load)) throw new RangeError('Combined resource load exceeds the integer limit')
      capacity = event.capacity ?? capacity
      segments.push({ resourceId, start: time, end: times[i + 1]!, load, capacity,
        overload: Math.max(0, load - capacity), taskIds: state.ids })
    }
  }
  return segments
}
