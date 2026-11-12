import type { ScheduledTask } from './scheduling.js'
import type { TimeRange } from './timeline.js'
import { assertScheduleRange, normalizeWorkPeriods } from './workCalendar.js'

export interface ResourceCapacity {
  id: string
  capacity: number
  periods?: readonly TimeRange[]
}

export interface ResourceAssignment {
  resourceId: string
  taskId: string
  units?: number
}

export interface ResourceLoadSegment extends TimeRange {
  resourceId: string
  load: number
  capacity: number
  overload: number
  taskIds: readonly string[]
}

interface LoadEvent {
  starts: { taskId: string; units: number }[]
  ends: { taskId: string; units: number }[]
  capacity?: number
}

/** Compare scheduled work to capacity over half-open intervals. */
export function calculateResourceLoad(
  range: TimeRange,
  tasks: readonly Pick<ScheduledTask, 'id' | 'work'>[],
  resources: readonly ResourceCapacity[],
  assignments: readonly ResourceAssignment[],
): ResourceLoadSegment[] {
  assertScheduleRange(range)
  const taskPeriods = new Map<string, TimeRange[]>()
  for (const task of tasks) {
    if (!task.id || taskPeriods.has(task.id)) throw new Error('Invalid or duplicate workload task: ' + task.id)
    taskPeriods.set(task.id, normalizeWorkPeriods(task.work, range))
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
    const events = new Map<number, LoadEvent>()
    eventAt(events, range.start)
    eventAt(events, range.end)
    for (const period of normalizeWorkPeriods(resource.periods ?? [range], range)) {
      eventAt(events, period.start).capacity = resource.capacity
      eventAt(events, period.end).capacity = 0
    }
    byResource.set(resource.id, events)
  }
  const assigned = new Map<string, Set<string>>()
  for (const { resourceId, taskId, units = 1 } of assignments) {
    const events = byResource.get(resourceId), work = taskPeriods.get(taskId)
    if (!events || !work) throw new Error('Unknown task or resource in assignment')
    if (!Number.isSafeInteger(units) || units <= 0) throw new RangeError('Assignment units must be a positive integer')
    let seen = assigned.get(resourceId)
    if (!seen) assigned.set(resourceId, seen = new Set())
    if (seen.has(taskId)) throw new Error('Duplicate resource assignment for task: ' + taskId)
    seen.add(taskId)
    for (const period of work) {
      eventAt(events, period.start).starts.push({ taskId, units })
      eventAt(events, period.end).ends.push({ taskId, units })
    }
  }

  const segments: ResourceLoadSegment[] = []
  for (const [resourceId, events] of byResource) {
    const times = [...events.keys()].sort((a, b) => a - b)
    const active = new Set<string>()
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
      if (!Number.isSafeInteger(load)) throw new RangeError('Combined resource load exceeds the integer limit')
      capacity = event.capacity ?? capacity
      segments.push({ resourceId, start: time, end: times[i + 1]!, load, capacity,
        overload: Math.max(0, load - capacity), taskIds: [...active] })
    }
  }
  return segments
}
