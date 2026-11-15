import { calculateResourceLoad, type ResourceAssignment, type ResourceCapacity, type ResourceLoadSegment } from './resourceLoad.js'
import {
  addUpperBounds, buildScheduleModel, cloneBounds, diagnose, firstIndex, limitsOf, lowerBounds, slotFor,
  topologicalOrder, type ModelTask, type Slot, type WorkClock,
} from './scheduleModel.js'
import {
  explainOption, recordSlotReasons, ScheduleTraceRecorder, type ExplainedLevelResourcesResult, type ScheduleOptions,
} from './scheduleTrace.js'
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

/** One reservation of a resource, kept only when explaining. */
interface Holding extends TimeRange {
  taskId: string
  units: number
}

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

/** Sorted ranges with touching neighbours joined. */
function mergeRanges(ranges: readonly TimeRange[]): TimeRange[] {
  const result: TimeRange[] = []
  for (const range of ranges) {
    const previous = result.at(-1)
    if (previous?.end === range.start) previous.end = range.end
    else result.push({ start: range.start, end: range.end })
  }
  return result
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
 *
 * With `{ explain: true }`, a successful result also has a `trace`. It holds the `latest` reasons of the horizon that
 * leveling may not pass and the `leveling` reasons recorded while capacity was reserved, including the resources,
 * intervals and holding tasks that delayed or split a task. It does not explain the replayed `scheduleTasks` run.
 */
export function levelResources(input: LevelResourcesInput, options?: ScheduleOptions & { explain?: false }): LevelResourcesResult
export function levelResources(input: LevelResourcesInput, options: ScheduleOptions & { explain: true }): ExplainedLevelResourcesResult
export function levelResources(input: LevelResourcesInput, options?: ScheduleOptions): LevelResourcesResult | ExplainedLevelResourcesResult
export function levelResources(input: LevelResourcesInput, options?: ScheduleOptions): LevelResourcesResult | ExplainedLevelResourcesResult {
  const explain = explainOption(options)
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
  const model = buildScheduleModel(plain, explain)
  const { range, tasks } = model
  const trace = explain ? new ScheduleTraceRecorder(plain.tasks.map(task => task.id)) : undefined
  const holdings = explain ? new Map<string, Holding[]>() : undefined

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
  const demands = new Map<string, { profile: Profile; units: number; resourceId: string }[]>()
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
    list.push({ profile, units, resourceId })
  }

  // Latest dates that keep every successor feasible, without holding the unleveled finish.
  const sorted = topologicalOrder(model)
  const order = 'order' in sorted ? sorted.order : []
  const horizon = new Map<string, Slot>()
  for (let i = order.length - 1; i >= 0; i--) {
    const task = tasks.get(order[i]!)!
    const bounds = addUpperBounds(cloneBounds(task.bounds), task, horizon)
    const limits = limitsOf(bounds)
    const slot = slotFor(task.clock, task.duration, limits, true)
    if (!slot) return diagnose(model, task, bounds)
    if (trace) recordSlotReasons(trace, 'latest', task, bounds, limits, slot, true, { linkParents: link => trace.ids('latest', link.to) })
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
  const reserved = new Map<string, TimeRange[]>()
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
    if (trace) {
      recordSlotReasons(trace, 'leveling', task, bounds, limits, early, false, {
        linkParents: link => trace.ids('leveling', link.from), horizon: trace.ids('latest', task.id),
      })
    }
    let chunks: TimeRange[] = [{ start: early.workStart, end: early.workStart + duration }]
    const needs = demands.get(task.id) ?? []
    let lastSlot: Slot | undefined
    if (duration > 0 && needs.length) {
      const blocked = normalizeWorkPeriods(needs.flatMap(need => need.profile.blocked(need.units, range.end)), range)
      const free = freeWork(clock, blocked)
      lastSlot = slotFor(clock, duration, limits, true)!
      const lastStart = lastSlot.workStart
      const found = task.source.splittable
        ? interrupted(free, early.workStart, duration, lastStart, clock.workAt(limits.endUpper))
        : contiguous(free, early.workStart, duration, lastStart)
      if (found) chunks = found
      else unresolved.add(task.id)
    }
    const slot = duration
      ? { start: clock.dateAt(chunks[0]!.start, false), end: clock.dateAt(chunks.at(-1)!.end, true), workStart: chunks[0]!.start }
      : early
    if (trace && lastSlot && (slot.start > early.start || chunks.length > 1 || unresolved.has(task.id))) {
      const stuck = unresolved.has(task.id)
      // Capacity is reserved before this task, so each holding names a task that occupies the resource first.
      const startMoved = slot.start > early.start || stuck
      const window = { start: early.start, end: Math.max(slot.end, early.end) }
      for (const need of needs) {
        const { profile, units, resourceId } = need
        const held = holdings!.get(resourceId) ?? []
        const pieces: { start: number; end: number; capacity: number; taskIds: string[] }[] = []
        for (let i = 0; i < profile.times.length; i++) {
          if (profile.values[i]! >= units) continue
          const start = Math.max(profile.times[i]!, window.start), end = Math.min(profile.times[i + 1] ?? range.end, window.end)
          if (start >= end || !clock.slices({ start, end }).length) continue
          const holders = held.filter(holding => holding.start < end && holding.end > start)
          const capacity = holders.reduce((sum, holding) => sum + holding.units, profile.values[i]!)
          const taskIds = [...new Set(holders.map(holding => holding.taskId))]
          const previous = pieces.at(-1)
          if (previous?.end === start && previous.capacity === capacity
            && previous.taskIds.length === taskIds.length && previous.taskIds.every((id, k) => id === taskIds[k])) previous.end = end
          else pieces.push({ start, end, capacity, taskIds })
        }
        for (const piece of pieces) {
          trace.add({
            taskId: task.id, phase: 'leveling', kind: 'capacity', bound: startMoved ? 'startLower' : 'endLower',
            candidateTime: startMoved ? early.start : early.end, placedTime: startMoved ? slot.start : slot.end,
            resourceId, demand: units, capacity: piece.capacity, relatedTaskIds: piece.taskIds,
            range: { start: piece.start, end: piece.end },
            parentReasonIds: [...new Set(piece.taskIds.flatMap(id => trace.ids('leveling', id)))],
          })
        }
      }
      if (stuck) {
        recordSlotReasons(trace, 'leveling', task, bounds, limits, lastSlot, true, {
          linkParents: () => [], horizon: trace.ids('latest', task.id),
        })
      }
    }
    if (slot.start > early.start) raised.add(task.id)
    if (chunks.length > 1) {
      added.set(task.id, chunks.slice(1).map((chunk, i) => ({
        start: clock.dateAt(chunks[i]!.end, false), end: clock.dateAt(chunk.start, false),
      })))
    }
    if (duration) {
      const slices: TimeRange[] = []
      for (const chunk of chunks) {
        for (const slice of clock.slices({ start: clock.dateAt(chunk.start, false), end: clock.dateAt(chunk.end, true) })) {
          for (const need of needs) {
            need.profile.reserve(slice, need.units, range.end)
            if (holdings) {
              let list = holdings.get(need.resourceId)
              if (!list) holdings.set(need.resourceId, list = [])
              list.push({ taskId: task.id, start: slice.start, end: slice.end, units: need.units })
            }
          }
          slices.push(slice)
        }
      }
      if (needs.length) reserved.set(task.id, mergeRanges(slices))
    }
    placed.set(task.id, slot)
    for (const link of task.outgoing) {
      const count = waiting.get(link.to)! - 1
      waiting.set(link.to, count)
      if (!count) queue.push(entry(tasks.get(link.to)!))
    }
  }

  // `raised` explains a delay; the pinned start keeps the reserved placement. A split task is pinned even when it
  // starts at its earliest date, because its added pauses alone would let an end bound (finishNoEarlierThan, FF, SF)
  // pull the start earlier than the reserved work.
  const leveledTasks = plain.tasks.map(task => {
    const pauses = added.get(task.id)
    if (!raised.has(task.id) && !pauses) return task
    const next: ScheduleTask = { ...task, startNoEarlierThan: placed.get(task.id)!.start }
    if (pauses) next.pauses = [...(task.pauses ?? []), ...pauses]
    return next
  })
  const leveled = scheduleTasks({ ...plain, tasks: leveledTasks })
  if (!leveled.ok) return leveled
  // The recomputed plan must do its work exactly where capacity was reserved. Report any task where it does not.
  for (const after of leveled.tasks) {
    const expected = reserved.get(after.id)
    if (!expected) continue
    const actual = mergeRanges(after.work)
    if (expected.length !== actual.length
      || expected.some((slice, i) => slice.start !== actual[i]!.start || slice.end !== actual[i]!.end)) unresolved.add(after.id)
  }
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
  const success: LevelResourcesSuccess = {
    ...leveled, leveledTasks, delays, overloads,
    unresolvedTaskIds: plain.tasks.filter(task => unresolved.has(task.id)).map(task => task.id),
  }
  return trace ? { ...success, trace: trace.trace() } : success
}
