import { calculateResourceLoad, type ResourceAssignment, type ResourceCapacity, type ResourceLoadSegment } from './resourceLoad.js'
import { appendJoined, firstIndex, joinTouching } from './intervals.js'
import {
  buildScheduleModel, diagnose, limitsOf, lowerBounds, manualSlot, slotFor, summarySlot, topologicalOrder, type ModelTask,
  type ScheduleModel, type Slot, type WorkClock,
} from './scheduleModel.js'
import { latestSlots } from './schedulePasses.js'
import {
  explainOption, recordManualReason, recordSlotReasons, ScheduleTraceRecorder, type ExplainedLevelResourcesResult,
  type ScheduleOptions,
} from './scheduleTrace.js'
import { scheduleTasks, type ScheduleFailure, type ScheduleInput, type ScheduleSuccess, type ScheduleTask } from './scheduling.js'
import type { TimeRange } from './timeline.js'
import { assignmentWorkRange, createAssignmentChecker, resourceCapacitySteps, sliceWork, type CapacityStep } from './resourceCapacity.js'
import { checkId } from './ids.js'
import { MinHeap } from './graphHeap.js'

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

/** One reservation of a resource, kept only when explaining. `order` counts the reservations of the resource. */
interface Holding extends TimeRange {
  taskId: string
  units: number
  order: number
}

/** The reservations of one resource, sorted by start, so that those in a window are found without a full scan. */
class Holdings {
  private items: Holding[] = []
  private longest = 0
  add(taskId: string, slice: TimeRange, units: number) {
    const { start, end } = slice
    const index = firstIndex(this.items.length, i => this.items[i]!.start > start)
    this.items.splice(index, 0, { taskId, start, end, units, order: this.items.length })
    this.longest = Math.max(this.longest, end - start)
  }
  /** The reservations that overlap `window`, sorted by start. */
  overlapping(window: TimeRange): Holding[] {
    const { items } = this, result: Holding[] = []
    // A reservation that starts `longest` or more before the window ends before it.
    for (let i = firstIndex(items.length, k => items[k]!.start > window.start - this.longest); i < items.length; i++) {
      const item = items[i]!
      if (item.start >= window.end) break
      if (item.end > window.start) result.push(item)
    }
    return result
  }
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
  /** Index of the segment that holds `time`, or 0 before the first segment. */
  indexAt(time: number): number {
    return Math.max(0, firstIndex(this.times.length, i => this.times[i]! > time) - 1)
  }
}

/**
 * Sorted, disjoint ranges that are computed only as far as they are read, so that placing a task near the start of a
 * long horizon does not pay for the rest of it. Each call of `fill` appends the next ranges, if any, possibly extending
 * the last one, and returns the new frontier, or Infinity once nothing is left: every range that starts before the
 * frontier is in `items`, and only the last one, while it ends at the frontier, can still grow.
 */
class LazyRanges {
  private readonly items: TimeRange[] = []
  private frontier = -Infinity
  constructor(private readonly fill: (out: TimeRange[]) => number) {}
  /** Range `index` if it starts before `limit`, reading no further than needed to tell. */
  startingBefore(index: number, limit: number): TimeRange | undefined {
    while (this.items.length <= index && this.frontier < limit) this.frontier = this.fill(this.items)
    const item = this.items[index]
    return item && item.start < limit ? item : undefined
  }
  /**
   * The end of range `index`, which must have been read: its final end, or an end for which `enough` holds already.
   * `enough` must stay true for any later end, so that a decision taken on it is the one the final end gives.
   */
  endOf(index: number, enough: (end: number) => boolean): number {
    const item = this.items[index]!
    while (item.end === this.frontier && !enough(item.end)) this.frontier = this.fill(this.items)
    return item.end
  }
  /** Index of the first range that ends after `time`, or the number of ranges when none does. */
  firstEndingAfter(time: number): number {
    while (this.frontier <= time) this.frontier = this.fill(this.items)
    const { items } = this
    return firstIndex(items.length, k => items[k]!.end > time)
  }
}

/** Whether sorted, disjoint `a` overlaps any of the lazy ranges `b`, reading `b` only as far as needed. */
function overlapsLazy(a: readonly TimeRange[], b: LazyRanges): boolean {
  let j = 0
  for (const range of a) {
    let cut = b.startingBefore(j, range.end)
    while (cut && b.endOf(j, end => end > range.start) <= range.start) cut = b.startingBefore(++j, range.end)
    if (cut) return true
  }
  return false
}

/**
 * Free intervals of a task clock, expressed as merged work-unit ranges and read on demand. Working periods that end
 * at or before `from` are skipped, so the first range can start later than it would otherwise, but never after
 * `clock.workAt(from)`. Each working period has the blocked intervals cut out of it, as `subtractPeriods` does.
 */
function freeWork(clock: WorkClock, blocked: LazyRanges, from = -Infinity): LazyRanges {
  const { periods } = clock
  let p = firstIndex(periods.length, i => periods[i]!.end > from), c = 0
  return new LazyRanges(out => {
    if (p >= periods.length) return Infinity
    const period = periods[p++]!
    let start = period.start
    let cut = blocked.startingBefore(c, period.end)
    while (cut && blocked.endOf(c, end => end > start) <= start) cut = blocked.startingBefore(++c, period.end)
    for (let i = c; cut; cut = blocked.startingBefore(++i, period.end)) {
      if (cut.start > start) appendJoined(out, clock.workAt(start), clock.workAt(cut.start))
      start = Math.max(start, blocked.endOf(i, end => end >= period.end))
      // Every later cut starts after this one ends, so none of them falls in this period.
      if (start >= period.end) break
    }
    if (start < period.end) appendJoined(out, clock.workAt(start), clock.workAt(period.end))
    return clock.workAt(period.end)
  })
}

/** Earliest uninterrupted work range within the free ranges. */
function contiguous(free: LazyRanges, first: number, duration: number, lastStart: number): TimeRange[] | undefined {
  for (let i = 0, range = free.startingBefore(0, Infinity); range; range = free.startingBefore(++i, Infinity)) {
    const start = Math.max(range.start, first)
    if (start > lastStart) return undefined
    if (start + duration <= free.endOf(i, end => start + duration <= end)) return [{ start, end: start + duration }]
  }
  return undefined
}

/** Earliest free work units, possibly interrupted. */
function interrupted(free: LazyRanges, first: number, duration: number, lastStart: number, lastEnd: number) {
  const chunks: TimeRange[] = []
  let remaining = duration
  for (let i = 0, range = free.startingBefore(0, Infinity); range; range = free.startingBefore(++i, Infinity)) {
    const start = Math.max(range.start, first)
    const end = free.endOf(i, reached => reached - start >= remaining)
    if (start >= end) continue
    if (!chunks.length && start > lastStart) return undefined
    const take = Math.min(end - start, remaining)
    chunks.push({ start, end: start + take })
    remaining -= take
    if (!remaining) break
  }
  return remaining || chunks.at(-1)!.end > lastEnd ? undefined : chunks
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
  free: LazyRanges
}

/**
 * Cut a task's work units `[0, duration)` where the set of needed resources changes, with the free work units of each
 * stretch. Stretches that need the same resources share one free list. `earliest` is the task's earliest start as a
 * date: shortages and working periods that end at or before it cannot affect the placement.
 */
function workPieces(
  clock: WorkClock, duration: number, spans: ReadonlyMap<Need, TimeRange>, range: TimeRange, earliest: number,
): WorkPiece[] {
  const entries = [...spans]
  const cuts = [...new Set([0, duration, ...entries.flatMap(([, span]) => [span.start, span.end])])].sort((a, b) => a - b)
  const cache = new Map<string, LazyRanges>()
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
      // `from` counts work units of the task, so the dates passed on must be the earliest start, not `from`.
      free = freeWork(clock, blockedBy(members.map(index => entries[index]![0]), range, earliest), earliest)
      cache.set(key, free)
    }
    pieces.push({ from, to, free })
  }
  return pieces
}

/**
 * The sorted, merged intervals in which any of `needs` finds too little capacity, read on demand, leaving out shortages
 * that end at or before `from`. Each need counts from the start of its profile segment that holds `from`, and the
 * profiles are swept together, one boundary at a time.
 */
function blockedBy(needs: readonly Need[], range: TimeRange, from: number): LazyRanges {
  const cursors = needs.map(need => need.profile.indexAt(from))
  let time = Infinity
  needs.forEach((need, k) => {
    time = Math.min(time, need.profile.times[cursors[k]!]!)
  })
  return new LazyRanges(out => {
    if (time >= range.end) return Infinity
    // Segment cursors[k] of a need holds `time` once it has started; the next boundary of any need ends this step.
    let next = range.end, short = false
    needs.forEach((need, k) => {
      const { times, values } = need.profile, i = cursors[k]!
      if (times[i]! > time) next = Math.min(next, times[i]!)
      else {
        next = Math.min(next, times[i + 1] ?? range.end)
        if (values[i]! < need.units) short = true
      }
    })
    if (short) appendJoined(out, time, next)
    needs.forEach((need, k) => {
      const { times } = need.profile, i = cursors[k]!
      if (times[i]! <= time && (times[i + 1] ?? range.end) === next) cursors[k] = i + 1
    })
    return time = next
  })
}

/**
 * Earliest uninterrupted work range in which every stretch lies in its own free work units. A free range [s, e) holds
 * a stretch for every task start in [s - from, e - to], so the result starts at the earliest start in `[first,
 * lastStart]` that every stretch allows, as intersecting those start intervals would give. The candidate start only
 * grows, so each stretch reads its free ranges once and only as far as the result.
 */
function contiguousPieces(pieces: readonly WorkPiece[], first: number, duration: number, lastStart: number): TimeRange[] | undefined {
  const cursors = pieces.map(() => 0)
  let start = first
  // Stop once every stretch in a row allows the candidate start.
  for (let k = 0, settled = 0; settled < pieces.length; k = (k + 1) % pieces.length) {
    if (start > lastStart) return undefined
    const { from, to, free } = pieces[k]!
    let range = free.startingBefore(cursors[k]!, Infinity)
    while (range) {
      const fits = (end: number) => !(end - range!.start < to - from || end - to < start)
      if (fits(free.endOf(cursors[k]!, fits))) break
      range = free.startingBefore(++cursors[k]!, Infinity)
    }
    if (!range) return undefined
    // A later start is checked again with this stretch too, in case rounding left its range empty.
    if (range.start - from > start) {
      start = range.start - from
      settled = 0
    } else settled++
  }
  return start > lastStart ? undefined : [{ start, end: start + duration }]
}

/** Earliest free work units, possibly interrupted, taking each stretch in turn from its own free work units. */
function interruptedPieces(pieces: readonly WorkPiece[], first: number, lastStart: number, lastEnd: number): TimeRange[] | undefined {
  const chunks: TimeRange[] = []
  let cursor = first
  for (const piece of pieces) {
    let remaining = piece.to - piece.from
    const { free } = piece
    for (let i = free.firstEndingAfter(cursor); remaining; i++) {
      const range = free.startingBefore(i, Infinity)
      if (!range) break
      const start = Math.max(range.start, cursor)
      if (!chunks.length && start > lastStart) return undefined
      const take = Math.min(free.endOf(i, end => end - start >= remaining) - start, remaining)
      appendJoined(chunks, start, start + take)
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
  checkLevelingFields(input.tasks)
  const plain: ScheduleInput = {
    range: input.range, quantum: input.quantum, calendars: input.calendars, defaultCalendarId: input.defaultCalendarId,
    tasks: input.tasks.map(withoutMode), dependencies: input.dependencies, deadline: input.deadline,
  }
  const base = scheduleTasks(plain)
  if (!base.ok) return base
  const model = buildScheduleModel(plain, explain)
  const { tasks } = model
  const trace = explain ? new ScheduleTraceRecorder(plain.tasks.filter(task => tasks.has(task.id)).map(task => task.id)) : undefined
  const demands = buildDemands(model, input)

  // Latest dates that keep every successor feasible, without holding the unleveled finish.
  const sorted = topologicalOrder(model)
  const order = 'order' in sorted ? sorted.order : []
  const unleveled = new Map(base.tasks.map(task => [task.id, task]))
  const horizon = latestSlots(model, order, unleveled, trace)
  if (!(horizon instanceof Map)) return horizon

  const state: LevelingState = {
    model, trace, holdings: explain ? new Map() : undefined, horizon,
    placed: new Map(), raised: new Set(), unresolved: new Set(), added: new Map(), reserved: new Map(),
  }
  // Priority: manual tasks (which never move) first, then explicit priority (higher first), total float, early start,
  // then ID in code-unit order. Manual tasks wait for no predecessor, so they are all placed before any other task.
  const entry = (task: ModelTask) => {
    const { totalFloat, start } = unleveled.get(task.id)!
    return { task, manual: Boolean(task.manual), priority: task.source.priority ?? 0, totalFloat, start }
  }
  const queue = new MinHeap<ReturnType<typeof entry>>((a, b) => a.manual !== b.manual ? a.manual
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
    if (task.summary) state.placed.set(task.id, summarySlot(task, state.placed))
    else {
      const needs = demands.get(task.id) ?? []
      if (task.manual) placeManual(state, task, needs)
      else {
        const failure = placeTask(state, task, needs)
        if (failure) return failure
      }
    }
    release(task)
  }
  return report(state, input, plain, base)
}

/** Checks the task fields that only leveling reads. */
function checkLevelingFields(tasks: readonly ScheduleTask[]) {
  for (const task of tasks) {
    if (task.mode !== undefined && task.mode !== 'asap' && task.mode !== 'alap') throw new Error('Invalid scheduling mode: ' + task.id)
    if (task.priority !== undefined && !Number.isFinite(task.priority)) throw new RangeError('Invalid task priority: ' + task.id)
    if (task.splittable !== undefined && typeof task.splittable !== 'boolean') throw new Error('Invalid splittable flag: ' + task.id)
  }
}

/**
 * The remaining capacity profile of every resource and the needs of every task that does work, from the validated
 * resources and assignments. Assignments of inactive and summary tasks take no capacity.
 */
function buildDemands(model: ScheduleModel, input: LevelResourcesInput): Map<string, Need[]> {
  const { range, tasks } = model
  const profiles = new Map<string, Profile>()
  const resourceIds = new Set<string>()
  for (const resource of input.resources) {
    checkId('resource', resource?.id, resourceIds)
    const steps = resourceCapacitySteps(resource, range, period => {
      model.validateTime(period.start)
      model.validateTime(period.end)
    })
    profiles.set(resource.id, new Profile(range, steps))
  }
  const demands = new Map<string, Need[]>()
  const check = createAssignmentChecker({
    hasResource: id => profiles.has(id),
    hasTask: id => tasks.has(id) || model.inactive.has(id),
  })
  for (const assignment of input.assignments) {
    check(assignment)
    const { resourceId, taskId, units = 1 } = assignment
    const profile = profiles.get(resourceId)!
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
  return demands
}

/** What the serial placement of `levelResources` has decided so far. */
interface LevelingState {
  model: ScheduleModel
  trace: ScheduleTraceRecorder | undefined
  /** The reservations of each resource, kept only when explaining. */
  holdings: Map<string, Holdings> | undefined
  /** The latest slot of each task, which leveling may not pass. */
  horizon: ReadonlyMap<string, Slot>
  placed: Map<string, Slot>
  /** Tasks that capacity delayed. */
  raised: Set<string>
  unresolved: Set<string>
  /** The pauses added to split tasks. */
  added: Map<string, TimeRange[]>
  /** The joined work slices reserved for each task with needs. */
  reserved: Map<string, TimeRange[]>
}

/**
 * Record the shortages of every resource the task needs in `window` as `capacity` reasons. Capacity is reserved
 * before this task, so each holding names a task that occupies the resource first. Adjacent shortages with the same
 * capacity form one reason that names every task holding the resource in it, so a task delayed behind many short
 * reservations gets one reason, not one per reservation. The profile and the reservations are swept once, from the
 * start of the window.
 */
function recordCapacity(
  state: LevelingState, recorder: ScheduleTraceRecorder, task: ModelTask, needs: readonly Need[], defaultWindow: TimeRange,
  startMoved: boolean, early: TimeRange, slot: TimeRange, windows?: ReadonlyMap<Need, TimeRange>,
) {
  const { range } = state.model
  for (const need of needs) {
    const { profile, units, resourceId } = need
    // A partial assignment only competes for its resource during its part of the work.
    const window = windows?.get(need) ?? defaultWindow
    const held = state.holdings!.get(resourceId)?.overlapping(window) ?? []
    const pieces: { start: number; end: number; capacity: number; holders: Set<Holding> }[] = []
    const active: Holding[] = []
    let next = 0
    const { times, values } = profile, { workAt } = task.clock
    for (let i = profile.indexAt(window.start); i < times.length && times[i]! < window.end; i++) {
      if (values[i]! >= units) continue
      const start = Math.max(times[i]!, window.start), end = Math.min(times[i + 1] ?? range.end, window.end)
      // Only a shortage in the task's working time can hold it up.
      if (start >= end || workAt(end) <= workAt(start)) continue
      while (next < held.length && held[next]!.start < end) active.push(held[next++]!)
      // Keep the reservations that still overlap this segment; every one of them started before its end.
      let kept = 0, capacity = values[i]!
      for (const holding of active) {
        if (holding.end <= start) continue
        active[kept++] = holding
        capacity += holding.units
      }
      active.length = kept
      const previous = pieces.at(-1)
      if (previous?.end === start && previous.capacity === capacity) {
        previous.end = end
        for (const holding of active) previous.holders.add(holding)
      } else pieces.push({ start, end, capacity, holders: new Set(active) })
    }
    for (const piece of pieces) {
      const taskIds = [...new Set([...piece.holders].sort((a, b) => a.order - b.order).map(holding => holding.taskId))]
      // Each task has its own reasons, so the holders' reason IDs never repeat.
      recorder.add({
        taskId: task.id, phase: 'leveling', kind: 'capacity', bound: startMoved ? 'startLower' : 'endLower',
        candidateTime: startMoved ? early.start : early.end, placedTime: startMoved ? slot.start : slot.end,
        resourceId, demand: units, capacity: piece.capacity, relatedTaskIds: taskIds,
        range: { start: piece.start, end: piece.end },
        parentReasonIds: taskIds.flatMap(id => recorder.ids('leveling', id)),
      })
    }
  }
}

/** Reserve the work slices of a task on every resource it needs, or only the part of them that a need covers. */
function reserve(state: LevelingState, task: ModelTask, needs: readonly Need[], slices: readonly TimeRange[]) {
  const { holdings } = state, { range } = state.model
  for (const need of needs) {
    for (const slice of need.part ? needSlices(need, slices) : slices) {
      need.profile.reserve(slice, need.units, range.end)
      if (holdings) {
        let list = holdings.get(need.resourceId)
        if (!list) holdings.set(need.resourceId, list = new Holdings())
        list.add(task.id, slice, need.units)
      }
    }
  }
  if (needs.length) state.reserved.set(task.id, joinTouching(slices))
}

/** A manual task stays at its dates. Its work takes capacity even where too little remains. */
function placeManual(state: LevelingState, task: ModelTask, needs: readonly Need[]) {
  const { trace, unresolved } = state, { range } = state.model
  const slot = manualSlot(task)
  if (trace) recordManualReason(trace, 'leveling', task)
  const slices = slot.start < slot.end ? task.clock.slices(slot) : []
  if (needs.length && slices.length) {
    if (needs.some(need => need.part)) {
      // Each need is checked over its own part of the work; a part clipped to nothing takes no capacity.
      const windows = new Map<Need, TimeRange>()
      let short = false
      for (const need of needs) {
        const own = needSlices(need, slices)
        if (!own.length) continue
        windows.set(need, need.part ? { start: own[0]!.start, end: own.at(-1)!.end } : slot)
        if (overlapsLazy(own, blockedBy([need], range, slot.start))) short = true
      }
      if (short) {
        unresolved.add(task.id)
        if (trace) recordCapacity(state, trace, task, [...windows.keys()], slot, true, slot, slot, windows)
      }
    } else {
      if (overlapsLazy(slices, blockedBy(needs, range, slot.start))) {
        unresolved.add(task.id)
        if (trace) recordCapacity(state, trace, task, needs, slot, true, slot, slot)
      }
    }
    reserve(state, task, needs, slices)
  }
  state.placed.set(task.id, slot)
}

/**
 * Place a task that leveling may move at the earliest dates where its needs find capacity, within its bounds and
 * horizon, and reserve its work. A task without such a placement stays at its earliest dates and is unresolved.
 * Returns the failure when the task has no feasible slot at all.
 */
function placeTask(state: LevelingState, task: ModelTask, needs: readonly Need[]): ScheduleFailure | undefined {
  const { model, trace, unresolved } = state, { range } = model
  const { clock, duration } = task
  const late = state.horizon.get(task.id)!
  const bounds = lowerBounds(task, state.placed)
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
    const free = freeWork(clock, blockedBy(needs, range, early.start), early.start)
    lastSlot = slotFor(clock, duration, limits, true)!
    const lastStart = lastSlot.workStart
    const found = task.source.splittable
      ? interrupted(free, early.workStart, duration, lastStart, clock.workAt(limits.endUpper))
      : contiguous(free, early.workStart, duration, lastStart)
    if (found) chunks = found
    else unresolved.add(task.id)
  } else if (duration > 0 && spans.size) {
    const pieces = workPieces(clock, duration, spans, range, early.start)
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
    if (whole) recordCapacity(state, trace, task, needs, window, slot.start > early.start || stuck, early, slot)
    else {
      // A partial need can only have been short between the earliest start of its part and the end of its placed part.
      const windows = new Map<Need, TimeRange>()
      for (const [need, span] of spans) {
        const start = Math.max(window.start, clock.dateAt(early.workStart + span.start, false))
        const end = Math.min(window.end, needSlices(need, slices).at(-1)?.end ?? window.end)
        if (start < end) windows.set(need, { start, end })
      }
      recordCapacity(state, trace, task, [...windows.keys()], window, slot.start > early.start || stuck, early, slot, windows)
    }
    if (stuck) {
      recordSlotReasons(trace, 'leveling', task, bounds, limits, lastSlot, true, {
        linkParents: () => [], horizon: trace.ids('latest', task.id), links: model.links,
      })
    }
  }
  if (slot.start > early.start) state.raised.add(task.id)
  if (chunks.length > 1) {
    state.added.set(task.id, chunks.slice(1).map((chunk, i) => ({
      start: clock.dateAt(chunks[i]!.end, false), end: clock.dateAt(chunk.start, false),
    })))
  }
  if (duration) reserve(state, task, needs, slices)
  state.placed.set(task.id, slot)
  return undefined
}

/**
 * Replay the placement with `scheduleTasks` and build the result: the leveled tasks, the delays against the unleveled
 * plan `base`, the remaining overloads and the unresolved tasks.
 */
function report(
  state: LevelingState, input: LevelResourcesInput, plain: ScheduleInput, base: ScheduleSuccess,
): LevelResourcesResult | ExplainedLevelResourcesResult {
  const { model, trace, placed, raised, unresolved, added, reserved } = state
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
  const overloads = calculateResourceLoad(model.range, leveled.tasks, input.resources, input.assignments,
    { inactiveTaskIds: model.inactive }).filter(segment => segment.overload > 0)
  const success: LevelResourcesSuccess = {
    ...leveled, leveledTasks, delays, overloads,
    unresolvedTaskIds: plain.tasks.filter(task => unresolved.has(task.id)).map(task => task.id),
  }
  return trace ? { ...success, trace: trace.trace() } : success
}
