// Internal helpers for time-varying capacity and partial assignments, shared by resource load, leveling and snapshot
// validation. Not part of the public entry.
import type { ResourceAssignment, ResourceCapacity, ResourceCapacityPeriod } from './resourceLoad.js'
import type { TimeRange } from './timeline.js'

/** From `time` until the next step, the resource has `capacity`. */
export interface CapacityStep {
  time: number
  capacity: number
}

/**
 * The validated `capacityPeriods` of a resource, sorted by start, or an empty list. Throws a RangeError for a period
 * without safe integer endpoints and positive length, a capacity that is not a nonnegative safe integer, or two
 * periods that overlap. Adjacent periods are allowed.
 */
export function capacityPeriodsOf(resource: ResourceCapacity): ResourceCapacityPeriod[] {
  const list = resource.capacityPeriods
  if (list === undefined) return []
  if (!Array.isArray(list)) throw new Error('Capacity periods must be an array: ' + resource.id)
  const periods: ResourceCapacityPeriod[] = []
  for (const period of list as readonly ResourceCapacityPeriod[]) {
    if (!period || typeof period !== 'object') throw new Error('Invalid capacity period of resource: ' + resource.id)
    const { start, end, capacity } = period
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || end <= start) {
      throw new RangeError('Capacity periods need integer endpoints and positive length: ' + resource.id)
    }
    if (!Number.isSafeInteger(capacity) || capacity < 0) throw new RangeError('Invalid capacity in a capacity period of resource: ' + resource.id)
    periods.push({ start, end, capacity })
  }
  periods.sort((a, b) => a.start - b.start)
  for (let i = 1; i < periods.length; i++) {
    const previous = periods[i - 1]!, period = periods[i]!
    if (previous.end > period.start) {
      throw new RangeError(`Capacity periods of resource ${resource.id} overlap: [${previous.start}, ${previous.end}) and [${period.start}, ${period.end})`)
    }
  }
  return periods
}

/**
 * The capacity of a resource as steps: inside each availability period, the capacity of the capacity period that
 * covers the time, else `base`; at the end of each availability period, 0. `availability` must be normalized and
 * `periods` sorted and disjoint. Without capacity periods, each availability period gives exactly a step to `base` at
 * its start and a step to 0 at its end. Linear in the number of periods.
 */
export function capacitySteps(base: number, periods: readonly ResourceCapacityPeriod[], availability: readonly TimeRange[]): CapacityStep[] {
  const steps: CapacityStep[] = []
  let c = 0
  for (const available of availability) {
    while (c < periods.length && periods[c]!.end <= available.start) c++
    let time = available.start
    let first = true
    while (time < available.end) {
      const period = periods[c]
      let capacity: number, next: number
      if (period && period.start <= time) {
        capacity = period.capacity
        next = Math.min(period.end, available.end)
        if (period.end <= available.end) c++
      } else {
        capacity = base
        next = period ? Math.min(period.start, available.end) : available.end
      }
      // Inside an availability period, a boundary between equal capacities is no change.
      if (first || steps.at(-1)!.capacity !== capacity) steps.push({ time, capacity })
      first = false
      time = next
    }
    steps.push({ time: available.end, capacity: 0 })
  }
  return steps
}

/** The validated work sub-range of an assignment, or undefined when it applies over the whole work of its task. */
export function assignmentWorkRange(assignment: Pick<ResourceAssignment, 'taskId' | 'workOffset' | 'workDuration'>) {
  const { workOffset, workDuration } = assignment
  if (workOffset === undefined && workDuration === undefined) return undefined
  if (workOffset !== undefined && (!Number.isSafeInteger(workOffset) || workOffset < 0)) {
    throw new RangeError('Assignment workOffset must be a nonnegative integer: ' + assignment.taskId)
  }
  if (workDuration !== undefined && (!Number.isSafeInteger(workDuration) || workDuration <= 0)) {
    throw new RangeError('Assignment workDuration must be a positive integer: ' + assignment.taskId)
  }
  return { offset: workOffset ?? 0, duration: workDuration }
}

/**
 * The elapsed periods of `work` (sorted, disjoint) from working time `offset` for `duration` (to the end of the work
 * when undefined), clipped to the work.
 */
export function sliceWork(work: readonly TimeRange[], offset: number, duration: number | undefined): TimeRange[] {
  const from = offset, to = duration === undefined ? Infinity : offset + duration
  const result: TimeRange[] = []
  let before = 0
  for (const period of work) {
    const length = period.end - period.start
    const start = Math.max(from, before), end = Math.min(to, before + length)
    if (start < end) result.push({ start: period.start + start - before, end: period.start + end - before })
    before += length
    if (before >= to) break
  }
  return result
}

/** Sorted copy of periods with overlapping and touching ones joined. The periods must have positive length. */
export function mergeWork(work: readonly TimeRange[]): TimeRange[] {
  const sorted = [...work].sort((a, b) => a.start - b.start)
  const result: TimeRange[] = []
  for (const period of sorted) {
    const previous = result.at(-1)
    if (previous && previous.end >= period.start) previous.end = Math.max(previous.end, period.end)
    else result.push({ start: period.start, end: period.end })
  }
  return result
}
