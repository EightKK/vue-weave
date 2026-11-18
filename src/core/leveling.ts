import { calculateResourceLoad, type ResourceAssignment, type ResourceCapacity, type ResourceLoadSegment } from './resourceLoad.js'
import { firstIndex, joinTouching, rangesOverlap } from './intervals.js'
import {
  addSummaryUpper, addUpperBounds, buildScheduleModel, cloneBounds, diagnose, limitsOf, lowerBounds, manualSlot,
  slotFor, summarySlot, summaryUpper, topologicalOrder, type ModelTask, type Slot, type SummaryUpper, type WorkClock,
} from './scheduleModel.js'
import {
  explainOption, recordManualReason, recordSlotReasons, ScheduleTraceRecorder, type ExplainedLevelResourcesResult,
  type ScheduleOptions,
} from './scheduleTrace.js'
import { scheduleTasks, type ScheduleFailure, type ScheduleInput, type ScheduleSuccess, type ScheduleTask } from './scheduling.js'
import type { TimeRange } from './timeline.js'
import { normalizeWorkPeriods } from './workCalendar.js'
import { assignmentWorkRange, resourceCapacitySteps, sliceWork, type CapacityStep } from './resourceCapacity.js'

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
  constructor(range: TimeRange, steps: readonly CapacityStep[]) {
    this.push(range.start, 0)
    for (const step of steps) if (step.time < range.end) this.push(step.time, step.capacity)
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

/** A resource that a task needs and, for a partial assignment, its part of the task's work in elapsed working time. */
interface Need {
  profile: Profile
  units: number
  resourceId: string
  part?: { offset: number; duration: number | undefined }
}

/** The elapsed periods of a task's work slices that a need covers. */
function needSlices(need: Need, slices: readonly TimeRange[]): TimeRange[] {
  return need.part ? sliceWork(slices, need.part.offset, need.part.duration) : [...slices]
}

/** A stretch `[from, to)` of a task's own work units, and the free work units of the resources needed in it. */
interface WorkPiece {
  from: number
  to: number
  free: TimeRange[]
}

/**
 * Cut a task's work units `[0, duration)` where the set of needed resources changes, with the free work units of each
 * stretch. Stretches that need the same resources share one free list.
 */
function workPieces(clock: WorkClock, duration: number, spans: ReadonlyMap<Need, TimeRange>, range: TimeRange): WorkPiece[] {
  const entries = [...spans]
  const cuts = [...new Set([0, duration, ...entries.flatMap(([, span]) => [span.start, span.end])])].sort((a, b) => a - b)
  const cache = new Map<string, TimeRange[]>()
  const pieces: WorkPiece[] = []
  for (let i = 0; i < cuts.length - 1; i++) {
    const from = cuts[i]!, to = cuts[i + 1]!
    const members: number[] = []
    entries.forEach(([, span], index) => {
      if (span.start <= from && span.end >= to) members.push(index)
    })
    const key = members.join()
    let free = cache.get(key)
    if (!free) {
      const blocked = members.flatMap(index => {
        const need = entries[index]![0]
        return need.profile.blocked(need.units, range.end)
      })
      free = freeWork(clock, normalizeWorkPeriods(blocked, range))
      cache.set(key, free)
    }
    pieces.push({ from, to, free })
  }
  return pieces
}

/** The closed intervals `[start, end]` common to two sorted lists of disjoint closed intervals. */
function intersectClosed(a: readonly (readonly [number, number])[], b: readonly (readonly [number, number])[]) {
  const result: [number, number][] = []
  let i = 0, j = 0
  while (i < a.length && j < b.length) {
    const start = Math.max(a[i]![0], b[j]![0]), end = Math.min(a[i]![1], b[j]![1])
    if (start <= end) result.push([start, end])
    if (a[i]![1] < b[j]![1]) i++
    else j++
  }
  return result
}

/** Earliest uninterrupted work range in which every stretch lies in its own free work units. */
function contiguousPieces(pieces: readonly WorkPiece[], first: number, duration: number, lastStart: number): TimeRange[] | undefined {
  if (first > lastStart) return undefined
  let valid: (readonly [number, number])[] = [[first, lastStart]]
  for (const piece of pieces) {
    const length = piece.to - piece.from
    // A free range [s, e) holds the stretch for every task start in [s - from, e - to].
    const starts = piece.free.filter(range => range.end - range.start >= length)
      .map(range => [range.start - piece.from, range.end - piece.to] as const)
    valid = intersectClosed(valid, starts)
    if (!valid.length) return undefined
  }
  const start = valid[0]![0]
  return [{ start, end: start + duration }]
}

/** Earliest free work units, possibly interrupted, taking each stretch in turn from its own free work units. */
function interruptedPieces(pieces: readonly WorkPiece[], first: number, lastStart: number, lastEnd: number): TimeRange[] | undefined {
  const chunks: TimeRange[] = []
  let cursor = first
  for (const piece of pieces) {
    let remaining = piece.to - piece.from
    const { free } = piece
    for (let i = firstIndex(free.length, k => free[k]!.end > cursor); i < free.length && remaining; i++) {
      const start = Math.max(free[i]!.start, cursor)
      if (!chunks.length && start > lastStart) return undefined
      const take = Math.min(free[i]!.end - start, remaining)
      const previous = chunks.at(-1)
      if (previous?.end === start) previous.end = start + take
      else chunks.push({ start, end: start + take })
      remaining -= take
      cursor = start + take
    }
    if (remaining) return undefined
  }
  return chunks.at(-1)!.end > lastEnd ? undefined : chunks
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
 * Manual tasks are never moved: their capacity is reserved first, at their manual dates, and one that finds too little
 * capacity there is listed in `unresolvedTaskIds`. Inactive tasks and their assignments are ignored.
 *
 * Capacity follows a resource's `capacityPeriods`, as in `calculateResourceLoad`, and an assignment with `workOffset` or
 * `workDuration` takes capacity only during its part of the task's work at each candidate placement.
 *
 * Summary tasks are never placed themselves: their dates roll up from their leveled subtasks, assignments to them take
 * no capacity, and they are not listed in `delays`.
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
  const trace = explain ? new ScheduleTraceRecorder(plain.tasks.filter(task => tasks.has(task.id)).map(task => task.id)) : undefined
  const holdings = explain ? new Map<string, Holding[]>() : undefined

  const profiles = new Map<string, Profile>()
  for (const resource of input.resources) {
    if (!resource.id || profiles.has(resource.id)) throw new Error('Invalid or duplicate resource: ' + resource.id)
    const steps = resourceCapacitySteps(resource, range, period => {
      model.validateTime(period.start)
      model.validateTime(period.end)
    })
    profiles.set(resource.id, new Profile(range, steps))
  }
  const demands = new Map<string, Need[]>()
  const assigned = new Set<string>()
  for (const assignment of input.assignments) {
    const { resourceId, taskId, units = 1 } = assignment
    const profile = profiles.get(resourceId)
    if (!profile) throw new Error('Unknown resource in assignment: ' + resourceId)
    if (!tasks.has(taskId) && !model.inactive.has(taskId)) throw new Error('Unknown task in assignment: ' + taskId)
    if (!Number.isSafeInteger(units) || units <= 0) throw new RangeError('Assignment units must be a positive integer')
    const pair = JSON.stringify([resourceId, taskId])
    if (assigned.has(pair)) throw new Error('Duplicate resource assignment for task: ' + taskId)
    assigned.add(pair)
    const part = assignmentWorkRange(assignment)
    if (part && (part.offset % model.quantum !== 0 || (part.duration ?? 0) % model.quantum !== 0)) {
      throw new RangeError('Assignment work offsets must align with the scheduling quantum: ' + taskId)
    }
    // A summary task does no work of its own, so its assignments take no capacity.
    if (model.inactive.has(taskId) || tasks.get(taskId)!.summary) continue
    let list = demands.get(taskId)
    if (!list) demands.set(taskId, list = [])
    const need: Need = { profile, units, resourceId }
    if (part) need.part = part
    list.push(need)
  }

  // Latest dates that keep every successor feasible, without holding the unleveled finish.
  const sorted = topologicalOrder(model)
  const order = 'order' in sorted ? sorted.order : []
  const horizon = new Map<string, Slot>()
  const unleveled = new Map(base.tasks.map(task => [task.id, task]))
  const inherited = new Map<string, SummaryUpper>()
  for (let i = order.length - 1; i >= 0; i--) {
    const task = tasks.get(order[i]!)!
    if (task.summary) {
      inherited.set(task.id, summaryUpper(model, task, horizon, inherited, unleveled))
      continue
    }
    if (task.manual) {
      if (trace) recordManualReason(trace, 'latest', task)
      horizon.set(task.id, manualSlot(task))
      continue
    }
    const bounds = addSummaryUpper(addUpperBounds(cloneBounds(task.bounds), task, horizon), task, inherited, unleveled)
    const limits = limitsOf(bounds)
    const slot = slotFor(task.clock, task.duration, limits, true)
    if (!slot) return diagnose(model, task, bounds)
    if (trace) {
      recordSlotReasons(trace, 'latest', task, bounds, limits, slot, true, {
        linkParents: link => trace.ids('latest', link.to), links: model.links,
      })
    }
    horizon.set(task.id, slot)
  }

  // Priority: manual tasks (which never move) first, then explicit priority (higher first), total float, early start,
  // then ID in code-unit order. Manual tasks wait for no predecessor, so they are all placed before any other task.
  const entry = (task: ModelTask) => {
    const { totalFloat, start } = unleveled.get(task.id)!
    return { task, manual: Boolean(task.manual), priority: task.source.priority ?? 0, totalFloat, start }
  }
  const queue = new Heap<ReturnType<typeof entry>>((a, b) => a.manual !== b.manual ? a.manual
    : a.priority !== b.priority ? a.priority > b.priority
      : a.totalFloat !== b.totalFloat ? a.totalFloat < b.totalFloat
        : a.start !== b.start ? a.start < b.start : a.task.id < b.task.id)
  const waiting = new Map<string, number>()
  // A summary waits for its children and is placed at their span.
  for (const task of tasks.values()) {
    const count = task.incoming.length + (task.summary?.children.length ?? 0)
    waiting.set(task.id, count)
    if (!count) queue.push(entry(task))
  }

  const placed = new Map<string, Slot>()
  const raised = new Set<string>(), unresolved = new Set<string>(), added = new Map<string, TimeRange[]>()
  const reserved = new Map<string, TimeRange[]>()
  /**
   * Record the shortages of every resource the task needs in `window` as `capacity` reasons. Capacity is reserved
   * before this task, so each holding names a task that occupies the resource first.
   */
  const recordCapacity = (
    recorder: ScheduleTraceRecorder, task: ModelTask, needs: readonly Need[], defaultWindow: TimeRange, startMoved: boolean,
    early: TimeRange, slot: TimeRange, windows?: ReadonlyMap<Need, TimeRange>,
  ) => {
    for (const need of needs) {
      const { profile, units, resourceId } = need
      // A partial assignment only competes for its resource during its part of the work.
      const window = windows?.get(need) ?? defaultWindow
      const held = holdings!.get(resourceId) ?? []
      const pieces: { start: number; end: number; capacity: number; taskIds: string[] }[] = []
      for (let i = 0; i < profile.times.length; i++) {
        if (profile.values[i]! >= units) continue
        const start = Math.max(profile.times[i]!, window.start), end = Math.min(profile.times[i + 1] ?? range.end, window.end)
        if (start >= end || !task.clock.slices({ start, end }).length) continue
        const holders = held.filter(holding => holding.start < end && holding.end > start)
        const capacity = holders.reduce((sum, holding) => sum + holding.units, profile.values[i]!)
        const taskIds = [...new Set(holders.map(holding => holding.taskId))]
        const previous = pieces.at(-1)
        if (previous?.end === start && previous.capacity === capacity
          && previous.taskIds.length === taskIds.length && previous.taskIds.every((id, k) => id === taskIds[k])) previous.end = end
        else pieces.push({ start, end, capacity, taskIds })
      }
      for (const piece of pieces) {
        recorder.add({
          taskId: task.id, phase: 'leveling', kind: 'capacity', bound: startMoved ? 'startLower' : 'endLower',
          candidateTime: startMoved ? early.start : early.end, placedTime: startMoved ? slot.start : slot.end,
          resourceId, demand: units, capacity: piece.capacity, relatedTaskIds: piece.taskIds,
          range: { start: piece.start, end: piece.end },
          parentReasonIds: [...new Set(piece.taskIds.flatMap(id => recorder.ids('leveling', id)))],
        })
      }
    }
  }
  /** Reserve the work slices of a task on every resource it needs, or only the part of them that a need covers. */
  const reserve = (task: ModelTask, needs: readonly Need[], slices: readonly TimeRange[]) => {
    for (const need of needs) {
      for (const slice of need.part ? needSlices(need, slices) : slices) {
        need.profile.reserve(slice, need.units, range.end)
        if (holdings) {
          let list = holdings.get(need.resourceId)
          if (!list) holdings.set(need.resourceId, list = [])
          list.push({ taskId: task.id, start: slice.start, end: slice.end, units: need.units })
        }
      }
    }
    if (needs.length) reserved.set(task.id, joinTouching(slices))
  }
  const release = (task: ModelTask) => {
    const next = task.outgoing.map(link => link.to)
    if (task.parent !== undefined) next.push(task.parent)
    for (const id of next) {
      const count = waiting.get(id)! - 1
      waiting.set(id, count)
      if (!count) queue.push(entry(tasks.get(id)!))
    }
  }
  while (queue.size) {
    const { task } = queue.pop()
    const { clock, duration } = task
    if (task.summary) {
      placed.set(task.id, summarySlot(task, placed))
      release(task)
      continue
    }
    const needs = demands.get(task.id) ?? []
    if (task.manual) {
      // A manual task stays at its dates. Its work takes capacity even where too little remains.
      const slot = manualSlot(task)
      if (trace) recordManualReason(trace, 'leveling', task)
      const slices = slot.start < slot.end ? clock.slices(slot) : []
      if (needs.length && slices.length) {
        if (needs.some(need => need.part)) {
          // Each need is checked over its own part of the work; a part clipped to nothing takes no capacity.
          const windows = new Map<Need, TimeRange>()
          let short = false
          for (const need of needs) {
            const own = needSlices(need, slices)
            if (!own.length) continue
            windows.set(need, need.part ? { start: own[0]!.start, end: own.at(-1)!.end } : slot)
            if (rangesOverlap(own, need.profile.blocked(need.units, range.end))) short = true
          }
          if (short) {
            unresolved.add(task.id)
            if (trace) recordCapacity(trace, task, [...windows.keys()], slot, true, slot, slot, windows)
          }
        } else {
          const blocked = normalizeWorkPeriods(needs.flatMap(need => need.profile.blocked(need.units, range.end)), range)
          if (rangesOverlap(slices, blocked)) {
            unresolved.add(task.id)
            if (trace) recordCapacity(trace, task, needs, slot, true, slot, slot)
          }
        }
        reserve(task, needs, slices)
      }
      placed.set(task.id, slot)
      release(task)
      continue
    }
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
    let lastSlot: Slot | undefined
    // The work units of each need; a partial need clipped to nothing takes no capacity.
    const spans = new Map<Need, TimeRange>()
    for (const need of needs) {
      const from = need.part ? Math.min(need.part.offset / model.quantum, duration) : 0
      const to = need.part?.duration === undefined ? duration : Math.min(from + need.part.duration / model.quantum, duration)
      if (from < to) spans.set(need, { start: from, end: to })
    }
    const whole = spans.size === needs.length && [...spans.values()].every(span => span.start === 0 && span.end === duration)
    if (duration > 0 && needs.length && whole) {
      const blocked = normalizeWorkPeriods(needs.flatMap(need => need.profile.blocked(need.units, range.end)), range)
      const free = freeWork(clock, blocked)
      lastSlot = slotFor(clock, duration, limits, true)!
      const lastStart = lastSlot.workStart
      const found = task.source.splittable
        ? interrupted(free, early.workStart, duration, lastStart, clock.workAt(limits.endUpper))
        : contiguous(free, early.workStart, duration, lastStart)
      if (found) chunks = found
      else unresolved.add(task.id)
    } else if (duration > 0 && spans.size) {
      const pieces = workPieces(clock, duration, spans, range)
      lastSlot = slotFor(clock, duration, limits, true)!
      const lastStart = lastSlot.workStart
      const found = task.source.splittable
        ? interruptedPieces(pieces, early.workStart, lastStart, clock.workAt(limits.endUpper))
        : contiguousPieces(pieces, early.workStart, duration, lastStart)
      if (found) chunks = found
      else unresolved.add(task.id)
    }
    const slot = duration
      ? { start: clock.dateAt(chunks[0]!.start, false), end: clock.dateAt(chunks.at(-1)!.end, true), workStart: chunks[0]!.start }
      : early
    const slices = duration
      ? chunks.flatMap(chunk => clock.slices({ start: clock.dateAt(chunk.start, false), end: clock.dateAt(chunk.end, true) }))
      : []
    if (trace && lastSlot && (slot.start > early.start || chunks.length > 1 || unresolved.has(task.id))) {
      const stuck = unresolved.has(task.id)
      const window = { start: early.start, end: Math.max(slot.end, early.end) }
      if (whole) recordCapacity(trace, task, needs, window, slot.start > early.start || stuck, early, slot)
      else {
        // A partial need can only have been short between the earliest start of its part and the end of its placed part.
        const windows = new Map<Need, TimeRange>()
        for (const [need, span] of spans) {
          const start = Math.max(window.start, clock.dateAt(early.workStart + span.start, false))
          const end = Math.min(window.end, needSlices(need, slices).at(-1)?.end ?? window.end)
          if (start < end) windows.set(need, { start, end })
        }
        recordCapacity(trace, task, [...windows.keys()], window, slot.start > early.start || stuck, early, slot, windows)
      }
      if (stuck) {
        recordSlotReasons(trace, 'leveling', task, bounds, limits, lastSlot, true, {
          linkParents: () => [], horizon: trace.ids('latest', task.id), links: model.links,
        })
      }
    }
    if (slot.start > early.start) raised.add(task.id)
    if (chunks.length > 1) {
      added.set(task.id, chunks.slice(1).map((chunk, i) => ({
        start: clock.dateAt(chunks[i]!.end, false), end: clock.dateAt(chunk.start, false),
      })))
    }
    if (duration) reserve(task, needs, slices)
    placed.set(task.id, slot)
    release(task)
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
    const actual = joinTouching(after.work)
    if (expected.length !== actual.length
      || expected.some((slice, i) => slice.start !== actual[i]!.start || slice.end !== actual[i]!.end)) unresolved.add(after.id)
  }
  const delays: ResourceDelay[] = []
  leveled.tasks.forEach((after, i) => {
    const before = base.tasks[i]!, pauses = added.get(after.id) ?? []
    if (after.summary) return
    if (before.start === after.start && before.end === after.end && !pauses.length) return
    delays.push({
      taskId: after.id, before: { start: before.start, end: before.end }, after: { start: after.start, end: after.end },
      delay: after.start - before.start, cause: raised.has(after.id) || pauses.length ? 'capacity' : 'predecessor', pauses,
    })
  })
  const overloads = calculateResourceLoad(range, leveled.tasks, input.resources, input.assignments,
    { inactiveTaskIds: model.inactive }).filter(segment => segment.overload > 0)
  const success: LevelResourcesSuccess = {
    ...leveled, leveledTasks, delays, overloads,
    unresolvedTaskIds: plain.tasks.filter(task => unresolved.has(task.id)).map(task => task.id),
  }
  return trace ? { ...success, trace: trace.trace() } : success
}
