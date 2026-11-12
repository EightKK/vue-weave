import { calculateResourceLoad, type ResourceAssignment, type ResourceCapacity, type ResourceLoadSegment } from './resourceLoad.js'
import {
  addUpperBounds, buildScheduleModel, cloneBounds, diagnose, firstIndex, limitsOf, lowerBounds, slotFor,
  topologicalOrder, type ModelTask, type Slot, type WorkClock,
} from './scheduleModel.js'
import { scheduleTasks, type ScheduleFailure, type ScheduleInput, type ScheduleSuccess, type ScheduleTask } from './scheduling.js'
import type { TimeRange } from './timeline.js'
import { normalizeWorkPeriods } from './workCalendar.js'

export interface LevelResourcesInput extends ScheduleInput {
  resources: readonly ResourceCapacity[]
  assignments: readonly ResourceAssignment[]
}

export interface ResourceDelay {
  taskId: string
  /** Dates before leveling, with every task scheduled as soon as possible. */
  before: TimeRange
  after: TimeRange
  /** `after.start - before.start`, in elapsed units. */
  delay: number
  /** `capacity` when leveling constrained the task itself; `predecessor` when only a dependency moved it. */
  cause: 'capacity' | 'predecessor'
  /** Pauses added to a splittable task. */
  pauses: readonly TimeRange[]
}

export interface LevelResourcesSuccess extends ScheduleSuccess {
  /** Input tasks with the added `startNoEarlierThan` and `pauses`. `scheduleTasks` reproduces this plan from them. */
  leveledTasks: readonly ScheduleTask[]
  /** Tasks whose dates or work segments changed, in input order. */
  delays: readonly ResourceDelay[]
  /** Remaining overloaded intervals of the leveled plan, as reported by `calculateResourceLoad`. */
  overloads: readonly ResourceLoadSegment[]
  /** Tasks without a capacity-feasible placement within their constraints, left at their earliest dates. In input order. */
  unresolvedTaskIds: readonly string[]
}

export type LevelResourcesResult = LevelResourcesSuccess | ScheduleFailure

/** Remaining capacity as a step function over the horizon. Segment i is [times[i], times[i + 1] ?? range.end). */
class Profile {
  times: number[] = []
  values: number[] = []
  constructor(range: TimeRange, capacity: number, periods: readonly TimeRange[]) {
    let cursor = range.start
    for (const period of periods) {
      if (period.start > cursor) this.push(cursor, 0)
      this.push(period.start, capacity)
      cursor = period.end
    }
    if (cursor < range.end) this.push(cursor, 0)
  }
  private push(time: number, value: number) {
    if (this.times.at(-1) === time) this.values[this.values.length - 1] = value
    else if (this.values.at(-1) !== value) {
      this.times.push(time)
      this.values.push(value)
    }
  }
  private split(time: number) {
    const index = firstIndex(this.times.length, i => this.times[i]! > time)
    if (this.times[index - 1] === time) return index - 1
    this.times.splice(index, 0, time)
    this.values.splice(index, 0, this.values[index - 1]!)
    return index
  }
  reserve(interval: TimeRange, units: number, rangeEnd: number) {
    const first = this.split(interval.start)
    const last = interval.end < rangeEnd ? this.split(interval.end) : this.times.length
    for (let i = first; i < last; i++) this.values[i]! -= units
  }
  /** Intervals where fewer than `units` remain. */
  blocked(units: number, rangeEnd: number): TimeRange[] {
    const result: TimeRange[] = []
    for (let i = 0; i < this.times.length; i++) {
      if (this.values[i]! >= units) continue
      const start = this.times[i]!, end = this.times[i + 1] ?? rangeEnd
      const previous = result.at(-1)
      if (previous?.end === start) previous.end = end
      else result.push({ start, end })
    }
    return result
  }
}

/** Free intervals of a task clock, expressed as merged work-unit ranges. */
function freeWork(clock: WorkClock, blocked: readonly TimeRange[]): TimeRange[] {
  const result: TimeRange[] = []
  const add = (from: number, to: number) => {
    if (from >= to) return
    const start = clock.workAt(from), end = clock.workAt(to)
    const previous = result.at(-1)
    if (previous?.end === start) previous.end = end
    else result.push({ start, end })
  }
  let b = 0
  for (const period of clock.periods) {
    let start = period.start
    while (b < blocked.length && blocked[b]!.end <= start) b++
    for (let i = b; i < blocked.length && blocked[i]!.start < period.end; i++) {
      add(start, Math.min(blocked[i]!.start, period.end))
      start = Math.max(start, blocked[i]!.end)
    }
    add(start, period.end)
  }
  return result
}

/** Earliest uninterrupted work range within the free ranges. */
function contiguous(free: readonly TimeRange[], first: number, duration: number, lastStart: number): TimeRange[] | undefined {
  for (const range of free) {
    const start = Math.max(range.start, first)
    if (start > lastStart) return undefined
    if (start + duration <= range.end) return [{ start, end: start + duration }]
  }
  return undefined
}

/** Earliest free work units, possibly interrupted. */
function interrupted(free: readonly TimeRange[], first: number, duration: number, lastStart: number, lastEnd: number) {
  const chunks: TimeRange[] = []
  let remaining = duration
  for (const range of free) {
    const start = Math.max(range.start, first)
    if (start >= range.end) continue
    if (!chunks.length && start > lastStart) return undefined
    const take = Math.min(range.end - start, remaining)
    chunks.push({ start, end: start + take })
    remaining -= take
    if (!remaining) break
  }
  return remaining || chunks.at(-1)!.end > lastEnd ? undefined : chunks
}

class Heap<T> {
  private items: T[] = []
  constructor(private before: (a: T, b: T) => boolean) {}
  get size() {
    return this.items.length
  }
  private swap(i: number, j: number) {
    const item = this.items[i]!
    this.items[i] = this.items[j]!
    this.items[j] = item
  }
  push(item: T) {
    let i = this.items.push(item) - 1
    while (i > 0) {
      const parent = (i - 1) >> 1
      if (!this.before(this.items[i]!, this.items[parent]!)) break
      this.swap(i, parent)
      i = parent
    }
  }
  pop(): T {
    const items = this.items, top = items[0]!, last = items.pop()!
    if (items.length) {
      items[0] = last
      let i = 0
      for (;;) {
        const left = 2 * i + 1, right = left + 1
        let best = i
        if (left < items.length && this.before(items[left]!, items[best]!)) best = left
        if (right < items.length && this.before(items[right]!, items[best]!)) best = right
        if (best === i) break
        this.swap(i, best)
        i = best
      }
    }
    return top
  }
}

function withoutMode(task: ScheduleTask): ScheduleTask {
  if (task.mode === undefined) return task
  const copy = { ...task }
  delete copy.mode
  return copy
}

/**
 * Delay tasks so that assigned load stays within resource capacity, using a deterministic
 * priority-based serial heuristic. Each task is placed as soon as dependencies, constraints,
 * calendars and remaining capacity allow; `mode` is ignored. The returned dates are those of
 * `scheduleTasks` applied to the returned `leveledTasks`.
 */
export function levelResources(input: LevelResourcesInput): LevelResourcesResult {
  for (const task of input.tasks) {
    if (task.mode !== undefined && task.mode !== 'asap' && task.mode !== 'alap') throw new Error('Invalid scheduling mode: ' + task.id)
    if (task.priority !== undefined && !Number.isFinite(task.priority)) throw new RangeError('Invalid task priority: ' + task.id)
    if (task.splittable !== undefined && typeof task.splittable !== 'boolean') throw new Error('Invalid splittable flag: ' + task.id)
  }
  const plain: ScheduleInput = {
    range: input.range, quantum: input.quantum, calendars: input.calendars, defaultCalendarId: input.defaultCalendarId,
    tasks: input.tasks.map(withoutMode), dependencies: input.dependencies, deadline: input.deadline,
  }
  const base = scheduleTasks(plain)
  if (!base.ok) return base
  const model = buildScheduleModel(plain)
  const { range, tasks } = model

  const profiles = new Map<string, Profile>()
  for (const resource of input.resources) {
    if (!resource.id || profiles.has(resource.id)) throw new Error('Invalid or duplicate resource: ' + resource.id)
    if (!Number.isSafeInteger(resource.capacity) || resource.capacity < 0) throw new RangeError('Invalid resource capacity: ' + resource.id)
    for (const period of resource.periods ?? []) {
      model.validateTime(period.start)
      model.validateTime(period.end)
    }
    profiles.set(resource.id, new Profile(range, resource.capacity, normalizeWorkPeriods(resource.periods ?? [range], range)))
  }
  const demands = new Map<string, { profile: Profile; units: number }[]>()
  const assigned = new Set<string>()
  for (const { resourceId, taskId, units = 1 } of input.assignments) {
    const profile = profiles.get(resourceId)
    if (!profile || !tasks.has(taskId)) throw new Error('Unknown task or resource in assignment')
    if (!Number.isSafeInteger(units) || units <= 0) throw new RangeError('Assignment units must be a positive integer')
    const pair = JSON.stringify([resourceId, taskId])
    if (assigned.has(pair)) throw new Error('Duplicate resource assignment for task: ' + taskId)
    assigned.add(pair)
    let list = demands.get(taskId)
    if (!list) demands.set(taskId, list = [])
    list.push({ profile, units })
  }

  // Latest dates that keep every successor feasible, without holding the unleveled finish.
  const sorted = topologicalOrder(model)
  const order = 'order' in sorted ? sorted.order : []
  const horizon = new Map<string, Slot>()
  for (let i = order.length - 1; i >= 0; i--) {
    const task = tasks.get(order[i]!)!
    const bounds = addUpperBounds(cloneBounds(task.bounds), task, horizon)
    const slot = slotFor(task.clock, task.duration, limitsOf(bounds), true)
    if (!slot) return diagnose(model, task, bounds)
    horizon.set(task.id, slot)
  }

  // Priority: explicit priority (higher first), total float, early start, then ID in code-unit order.
  const unleveled = new Map(base.tasks.map(task => [task.id, task]))
  const entry = (task: ModelTask) => {
    const { totalFloat, start } = unleveled.get(task.id)!
    return { task, priority: task.source.priority ?? 0, totalFloat, start }
  }
  const queue = new Heap<ReturnType<typeof entry>>((a, b) => a.priority !== b.priority ? a.priority > b.priority
    : a.totalFloat !== b.totalFloat ? a.totalFloat < b.totalFloat
      : a.start !== b.start ? a.start < b.start : a.task.id < b.task.id)
  const waiting = new Map<string, number>()
  for (const task of tasks.values()) {
    waiting.set(task.id, task.incoming.length)
    if (!task.incoming.length) queue.push(entry(task))
  }

  const placed = new Map<string, Slot>()
  const raised = new Set<string>(), unresolved = new Set<string>(), added = new Map<string, TimeRange[]>()
  while (queue.size) {
    const { task } = queue.pop()
    const { clock, duration } = task
    const late = horizon.get(task.id)!
    const bounds = lowerBounds(task, placed)
    bounds.startUpper.push({ value: late.start })
    bounds.endUpper.push({ value: late.end })
    const limits = limitsOf(bounds)
    const early = slotFor(clock, duration, limits, false)
    if (!early) return diagnose(model, task, bounds)
    let chunks: TimeRange[] = [{ start: early.workStart, end: early.workStart + duration }]
    const needs = demands.get(task.id) ?? []
    if (duration > 0 && needs.length) {
      const blocked = normalizeWorkPeriods(needs.flatMap(need => need.profile.blocked(need.units, range.end)), range)
      const free = freeWork(clock, blocked)
      const lastStart = slotFor(clock, duration, limits, true)!.workStart
      const found = task.source.splittable
        ? interrupted(free, early.workStart, duration, lastStart, clock.workAt(limits.endUpper))
        : contiguous(free, early.workStart, duration, lastStart)
      if (found) chunks = found
      else unresolved.add(task.id)
    }
    const slot = duration
      ? { start: clock.dateAt(chunks[0]!.start, false), end: clock.dateAt(chunks.at(-1)!.end, true), workStart: chunks[0]!.start }
      : early
    if (slot.start > early.start) raised.add(task.id)
    if (chunks.length > 1) {
      added.set(task.id, chunks.slice(1).map((chunk, i) => ({
        start: clock.dateAt(chunks[i]!.end, false), end: clock.dateAt(chunk.start, false),
      })))
    }
    if (duration) {
      for (const chunk of chunks) {
        for (const slice of clock.slices({ start: clock.dateAt(chunk.start, false), end: clock.dateAt(chunk.end, true) })) {
          for (const need of needs) need.profile.reserve(slice, need.units, range.end)
        }
      }
    }
    placed.set(task.id, slot)
    for (const link of task.outgoing) {
      const count = waiting.get(link.to)! - 1
      waiting.set(link.to, count)
      if (!count) queue.push(entry(tasks.get(link.to)!))
    }
  }

  const leveledTasks = plain.tasks.map(task => {
    const pauses = added.get(task.id)
    if (!raised.has(task.id) && !pauses) return task
    const next: ScheduleTask = { ...task }
    if (raised.has(task.id)) next.startNoEarlierThan = placed.get(task.id)!.start
    if (pauses) next.pauses = [...(task.pauses ?? []), ...pauses]
    return next
  })
  const leveled = scheduleTasks({ ...plain, tasks: leveledTasks })
  if (!leveled.ok) return leveled
  const delays: ResourceDelay[] = []
  leveled.tasks.forEach((after, i) => {
    const before = base.tasks[i]!, pauses = added.get(after.id) ?? []
    if (before.start === after.start && before.end === after.end && !pauses.length) return
    delays.push({
      taskId: after.id, before: { start: before.start, end: before.end }, after: { start: after.start, end: after.end },
      delay: after.start - before.start, cause: raised.has(after.id) || pauses.length ? 'capacity' : 'predecessor', pauses,
    })
  })
  const overloads = calculateResourceLoad(range, leveled.tasks, input.resources, input.assignments)
    .filter(segment => segment.overload > 0)
  return {
    ...leveled, leveledTasks, delays, overloads,
    unresolvedTaskIds: plain.tasks.filter(task => unresolved.has(task.id)).map(task => task.id),
  }
}
