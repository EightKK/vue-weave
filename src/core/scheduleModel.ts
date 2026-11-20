// Internal scheduling model shared by scheduleTasks and levelResources. Not part of the public entry.
import type {
  ScheduleConstraintName, ScheduleCycle, ScheduleInput, ScheduleLink, ScheduleTask, ScheduleFailure,
} from './scheduling.js'
import type { TimeRange } from './timeline.js'
import { firstIndex, subtractPeriods } from './intervals.js'
import { assertScheduleRange, integerPeriodMessage, normalizeWorkPeriods } from './workCalendar.js'
import { checkId, unknownEndpointError } from './ids.js'

export type Limits = { startLower: number; endLower: number; startUpper: number; endUpper: number }
export type LimitKey = keyof Limits
/**
 * A bound without a constraint or dependency is a leveling horizon bound. `summaryId` names the summary task that a
 * subtask inherits a constraint from. `linkTo` names the successor whose dates give an upper dependency bound: a link
 * into a summary task is attached to each of its leaves under the same ID, so the ID alone does not name the leaf.
 */
export type Bound = {
  value: number; constraint?: ScheduleConstraintName; dependencyId?: string; summaryId?: string; linkTo?: string
}
export type Bounds = Record<LimitKey, Bound[]>
export type Slot = TimeRange & { workStart: number }

/** Work starts and finishes have different inverses at shift boundaries. */
export function workClock(periods: readonly TimeRange[], quantum: number) {
  let total = 0
  const entries = periods.map(period => {
    const before = total
    total += (period.end - period.start) / quantum
    return { ...period, before, after: total }
  })
  function workAt(time: number) {
    const period = entries[firstIndex(entries.length, i => entries[i]!.end > time)]
    return period ? period.before + Math.max(0, time - period.start) / quantum : total
  }
  function dateAt(work: number, finish: boolean) {
    const index = firstIndex(entries.length, i => finish ? entries[i]!.after >= work : entries[i]!.after > work)
    const period = entries[index]!
    return period.start + (work - period.before) * quantum
  }
  function minFinishWork(time: number) {
    const work = workAt(time)
    return work > 0 && dateAt(work, true) >= time ? work : work + 1
  }
  function maxStartWork(time: number) {
    const work = Math.min(workAt(time), total - 1)
    return work >= 0 && dateAt(work, false) > time ? work - 1 : work
  }
  function slices(interval: TimeRange): TimeRange[] {
    const work: TimeRange[] = []
    for (let i = firstIndex(entries.length, index => entries[index]!.end > interval.start); i < entries.length; i++) {
      const period = entries[i]!
      if (period.start >= interval.end) break
      work.push({ start: Math.max(period.start, interval.start), end: Math.min(period.end, interval.end) })
    }
    return work
  }
  return { periods, total, workAt, dateAt, minFinishWork, maxStartWork, slices }
}
export type WorkClock = ReturnType<typeof workClock>

function slotAt(clock: WorkClock, start: number, duration: number): Slot | undefined {
  if (start < 0 || start + duration > clock.total) return undefined
  return { start: clock.dateAt(start, false), end: clock.dateAt(start + duration, true), workStart: start }
}

export function slotFor(clock: WorkClock, duration: number, limits: Limits, latest: boolean): Slot | undefined {
  const { startLower, endLower, startUpper, endUpper } = limits
  if (Math.max(startLower, endLower) > endUpper || startLower > startUpper) return undefined
  if (duration === 0) {
    const point = latest ? Math.min(startUpper, endUpper) : Math.max(startLower, endLower)
    return point >= Math.max(startLower, endLower) && point <= Math.min(startUpper, endUpper)
      ? { start: point, end: point, workStart: 0 } : undefined
  }
  const first = Math.max(clock.workAt(startLower), clock.minFinishWork(endLower) - duration)
  const last = Math.min(clock.maxStartWork(startUpper), clock.workAt(endUpper) - duration)
  return first <= last ? slotAt(clock, latest ? last : first, duration) : undefined
}

export function sourceFinish(link: ScheduleLink) {
  return (link.type ?? 'FS')[0] === 'F'
}
export function targetFinish(link: ScheduleLink) {
  return (link.type ?? 'FS')[1] === 'F'
}

export interface ModelTask {
  id: string
  index: number
  source: ScheduleTask
  clock: WorkClock
  duration: number
  alap: boolean
  bounds: Bounds
  /** Links that bind this task: every link into it, unless the task is manual. */
  incoming: ScheduleLink[]
  /** Links to tasks that are not manual. */
  outgoing: ScheduleLink[]
  /** For a manual task: the links into it, which no pass applies. They still count for cycle detection. */
  manualIncoming: ScheduleLink[]
  /** Links to manual tasks. No pass applies them, except an ALAP placement that already meets them. */
  manualOutgoing: ScheduleLink[]
  /** The manually scheduled dates of a manual task. */
  manual?: TimeRange
  /** Only when explaining: the continuous clock, the task's calendar clock without its pauses, and the calendar's ID. */
  calendar?: { continuous: WorkClock; clock: WorkClock; id: string | undefined }
  /** The active summary task this task belongs to. */
  parent?: string
  /**
   * Present for a summary task: its active children in input order, and its active leaf descendants as the slice
   * `[first, last)` of `ScheduleModel.leaves`. A summary has no incoming links: links into it are attached to its leaves.
   */
  summary?: { children: string[]; first: number; last: number }
}

export interface ScheduleModel {
  range: TimeRange
  quantum: number
  tasks: Map<string, ModelTask>
  continuous: WorkClock
  linkIndex: Map<string, number>
  validateTime: (value: number | undefined) => void
  /** IDs of inactive tasks. They are validated but are not in `tasks`, and their links are attached to no task. */
  inactive: ReadonlySet<string>
  /** Active leaf tasks in hierarchy order, so that the leaves of each summary are contiguous. Empty without hierarchy. */
  leaves: readonly string[]
  /** Active summary tasks, each after all of its subtasks (post-order). Empty without hierarchy. */
  summaries: readonly string[]
  /** The input links by ID. */
  links: ReadonlyMap<string, ScheduleLink>
}

/**
 * Subtasks whose start has happened, keyed by the input object they belong to. They do not inherit the start bounds of
 * their summary tasks (links into a summary and its `startNoEarlierThan`). Only `rescheduleFromStatusDate` and
 * `rescheduleFromActuals` set it.
 */
export const startedSubtasks = new WeakMap<ScheduleInput, ReadonlySet<string>>()

/** `input`, with `started` recorded as its started subtasks when there are any. */
export function withStartedSubtasks(input: ScheduleInput, started: ReadonlySet<string>): ScheduleInput {
  if (started.size) startedSubtasks.set(input, started)
  return input
}

/** Check the status date of `rescheduleFromStatusDate` and `rescheduleFromActuals` against a model. */
export function checkStatusDate(model: ScheduleModel, statusDate: number) {
  if (typeof statusDate !== 'number' || !Number.isFinite(statusDate)) throw new RangeError('The status date must be finite')
  if (statusDate < model.range.start || statusDate > model.range.end) throw new RangeError('The status date must be inside the schedule range')
  model.validateTime(statusDate)
}

/**
 * Check a recorded interval of scheduling input that needs positive length inside the schedule range, with the
 * scheduler's own messages: both endpoints as `validateTime` checks every scheduling date (finite, integer, aligned with
 * the horizon and quantum), then positive length as for working periods and pauses, then the range. Callers add which
 * interval it is with `withContext`.
 */
export function checkScheduleInterval(model: ScheduleModel, interval: TimeRange) {
  const { start, end } = interval
  model.validateTime(start)
  model.validateTime(end)
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || end <= start) throw new RangeError(integerPeriodMessage)
  if (start < model.range.start || end > model.range.end) throw new RangeError('Scheduling dates must lie inside the schedule range')
}

/** Whether a value can be read like a `ReadonlyMap`: it has `get` and is iterable. */
export function isMapLike(value: unknown): value is ReadonlyMap<unknown, unknown> {
  const map = value as { get?: unknown; [Symbol.iterator]?: unknown } | undefined
  return typeof map?.get === 'function' && typeof map[Symbol.iterator] === 'function'
}

/** Constraints that a summary task cannot have, because its dates are derived from its subtasks. */
const summaryForbidden = ['fixedStart', 'startNoLaterThan', 'finishNoEarlierThan', 'manual'] as const

/**
 * Validate a scheduling input and index it. Throws for malformed input. With `explain`, each task also keeps its
 * calendar clock without pauses, so that a trace can tell calendar time off from pauses.
 */
export function buildScheduleModel(input: ScheduleInput, explain = false): ScheduleModel {
  const { range, quantum = 1, deadline, dependencies = [] } = input
  assertScheduleRange(range)
  if (!Number.isSafeInteger(quantum) || quantum <= 0) throw new RangeError('Invalid scheduling quantum')
  const validateTime = (value: number | undefined) => {
    if (value !== undefined && (!Number.isSafeInteger(value) || (value - range.start) % quantum !== 0)) {
      throw new RangeError('Scheduling dates must align with the horizon and quantum')
    }
  }
  validateTime(range.end)
  validateTime(deadline)
  const continuous = workClock([range], quantum)
  const calendars = new Map<string, WorkClock>()
  const calendarIds = new Set<string>()
  for (const calendar of input.calendars ?? []) {
    checkId('calendar', calendar?.id, calendarIds)
    for (const period of calendar.periods) {
      validateTime(period.start)
      validateTime(period.end)
    }
    calendars.set(calendar.id, workClock(normalizeWorkPeriods(calendar.periods, range), quantum))
  }
  function calendarFor(id: string | undefined) {
    if (id === undefined) return continuous
    const calendar = calendars.get(id)
    if (!calendar) throw new Error('Unknown calendar: ' + id)
    return calendar
  }
  const defaultCalendar = calendarFor(input.defaultCalendarId)
  const tasks = new Map<string, ModelTask>()
  const ids = new Set<string>(), inactive = new Set<string>()
  input.tasks.forEach((task, index) => {
    checkId('task', task?.id, ids)
    if (!Number.isSafeInteger(task.duration) || task.duration < 0 || task.duration % quantum !== 0) throw new RangeError('Invalid task duration: ' + task.id)
    if (task.mode !== undefined && task.mode !== 'asap' && task.mode !== 'alap') throw new Error('Invalid scheduling mode: ' + task.id)
    const { startNoEarlierThan, startNoLaterThan, finishNoEarlierThan, finishNoLaterThan, fixedStart } = task
    for (const value of [startNoEarlierThan, startNoLaterThan, finishNoEarlierThan, finishNoLaterThan, fixedStart]) validateTime(value)
    let clock = task.calendarId === undefined ? defaultCalendar : calendarFor(task.calendarId)
    const calendarClock = clock
    if (task.pauses !== undefined) {
      if (!Array.isArray(task.pauses)) throw new Error('Task pauses must be an array: ' + task.id)
      for (const pause of task.pauses) {
        validateTime(pause.start)
        validateTime(pause.end)
      }
      const pauses = normalizeWorkPeriods(task.pauses, range)
      if (pauses.length) clock = workClock(subtractPeriods(clock.periods, pauses), quantum)
    }
    if (task.inactive !== undefined && typeof task.inactive !== 'boolean') throw new Error('Invalid inactive flag: ' + task.id)
    checkParentId(task)
    let manual: TimeRange | undefined
    if (task.manual !== undefined) {
      if (typeof task.manual !== 'object' || task.manual === null) throw new Error('Manual dates must be an object with a start and an end: ' + task.id)
      const { start, end } = task.manual
      if (typeof start !== 'number' || typeof end !== 'number') throw new RangeError('Manual dates must be numbers: ' + task.id)
      validateTime(start)
      validateTime(end)
      if (end < start) throw new RangeError('Manual dates cannot end before they start: ' + task.id)
      if (start < range.start || end > range.end) throw new RangeError('Manual dates must lie inside the schedule range: ' + task.id)
      manual = { start, end }
    }
    if (task.inactive) {
      inactive.add(task.id)
      return
    }
    const bound = (value: number | undefined, constraint: ScheduleConstraintName) =>
      value === undefined ? [] : [{ value, constraint }]
    const modelTask: ModelTask = {
      id: task.id, index, source: task, clock, duration: task.duration / quantum, alap: task.mode === 'alap' && !manual,
      bounds: {
        startLower: [{ value: range.start, constraint: 'range' }, ...bound(startNoEarlierThan, 'startNoEarlierThan'), ...bound(fixedStart, 'fixedStart')],
        endLower: [{ value: range.start, constraint: 'range' }, ...bound(finishNoEarlierThan, 'finishNoEarlierThan')],
        startUpper: [{ value: range.end, constraint: 'range' }, ...bound(startNoLaterThan, 'startNoLaterThan'), ...bound(fixedStart, 'fixedStart')],
        endUpper: [{ value: range.end, constraint: 'range' }, ...bound(deadline, 'deadline'), ...bound(finishNoLaterThan, 'finishNoLaterThan')],
      },
      incoming: [], outgoing: [], manualIncoming: [], manualOutgoing: [],
    }
    if (manual) modelTask.manual = manual
    if (explain) modelTask.calendar = { continuous, clock: calendarClock, id: task.calendarId ?? input.defaultCalendarId }
    tasks.set(task.id, modelTask)
  })
  const started = startedSubtasks.get(input)
  const hierarchy = input.tasks.some(task => task.parentId !== undefined)
    ? buildHierarchy(input.tasks, tasks, inactive, started) : undefined
  const leaves = hierarchy?.leaves ?? []
  const summaries = hierarchy?.summaries ?? []
  const linkIndex = new Map<string, number>()
  const links = new Map<string, ScheduleLink>()
  const linkIds = new Set<string>()
  for (const link of dependencies) {
    checkId('dependency', link?.id, linkIds)
    for (const end of [link.from, link.to]) if (!ids.has(end)) throw unknownEndpointError(link.id)
    if (!['FS', 'SS', 'FF', 'SF'].includes(link.type ?? 'FS')) throw new Error('Invalid schedule dependency type: ' + link.id)
    const lag = link.lag ?? 0
    if (!Number.isSafeInteger(lag) || lag % quantum !== 0) throw new RangeError('Invalid schedule dependency lag: ' + link.id)
    if (hierarchy) checkSummaryLink(link, hierarchy)
    linkIndex.set(link.id, linkIndex.size)
    links.set(link.id, link)
    // A link that touches an inactive task takes no part; a link into a manual task binds nothing. A link into a summary
    // task binds each of its active leaf subtasks, except subtasks whose start has already happened.
    const from = tasks.get(link.from), to = tasks.get(link.to)
    if (!from || !to) continue
    const targets = to.summary ? leaves.slice(to.summary.first, to.summary.last).filter(id => !started?.has(id)) : [link.to]
    for (const target of targets) {
      const item = target === link.to ? link : { ...link, to: target }
      const successor = tasks.get(target)!
      if (successor.manual) {
        from.manualOutgoing.push(item)
        successor.manualIncoming.push(item)
      } else {
        from.outgoing.push(item)
        successor.incoming.push(item)
      }
    }
  }
  return { range, quantum, tasks, continuous, linkIndex, validateTime, inactive, leaves, summaries, links }
}

/** Check the `parentId` of one task as `buildScheduleModel` does: absent, or a non-empty string. */
export function checkParentId(task: ScheduleTask) {
  if (task.parentId !== undefined && (typeof task.parentId !== 'string' || !task.parentId)) throw new Error('Invalid parent task ID: ' + task.id)
}

/**
 * Check the summary task hierarchy of `parentId` with the scheduler's errors: unknown parents, parent cycles, and what a
 * summary task cannot have. Returns the children of each summary in input order and the top-level tasks. Expects task
 * IDs and `parentId` values that are already checked. Iterative.
 */
export function checkSummaryHierarchy(list: readonly ScheduleTask[]) {
  const byId = new Map(list.map(task => [task.id, task]))
  const children = new Map<string, ScheduleTask[]>()
  const roots: ScheduleTask[] = []
  for (const task of list) {
    if (task.parentId === undefined) {
      roots.push(task)
      continue
    }
    if (!byId.has(task.parentId)) throw new Error('Unknown parent task ' + task.parentId + ' of task ' + task.id)
    let group = children.get(task.parentId)
    if (!group) children.set(task.parentId, group = [])
    group.push(task)
  }
  const state = new Map<string, 'open' | 'done'>()
  for (const task of list) {
    const path: string[] = []
    let id: string | undefined = task.id
    while (id !== undefined && !state.has(id)) {
      state.set(id, 'open')
      path.push(id)
      id = byId.get(id)!.parentId
    }
    if (id !== undefined && state.get(id) === 'open') {
      const loop = [...path.slice(path.indexOf(id)), id]
      throw new Error('The parent IDs of these tasks form a cycle: ' + loop.join(' → '))
    }
    for (const item of path) state.set(item, 'done')
  }
  for (const id of children.keys()) {
    const task = byId.get(id)!
    for (const key of summaryForbidden) if (task[key] !== undefined) throw new Error(`Summary task ${id} cannot have ${key}`)
    if (task.mode === 'alap') throw new Error(`Summary task ${id} cannot have mode 'alap'`)
  }
  return { children, roots }
}

/**
 * Check a link against a valid summary task hierarchy with the scheduler's errors: it must not link a summary with its
 * own subtask, and only FS and SS links can end at a summary.
 */
export function checkSummaryLink(
  link: ScheduleLink, hierarchy: { isSummary: (id: string) => boolean; isAncestor: (ancestor: string, id: string) => boolean },
) {
  if (link.from !== link.to) {
    const down = hierarchy.isAncestor(link.from, link.to)
    if (down || hierarchy.isAncestor(link.to, link.from)) {
      throw new Error(`Dependency ${link.id} links summary task ${down ? link.from : link.to} with its own subtask ${down ? link.to : link.from}`)
    }
  }
  if (hierarchy.isSummary(link.to) && targetFinish(link)) {
    throw new Error(`Dependency ${link.id} is ${link.type} into summary task ${link.to}; only FS and SS links can end at a summary task`)
  }
}

/**
 * Validate the summary task hierarchy of `parentId` and apply it to the model: every task below an inactive task, and
 * every summary without an active leaf, becomes inactive; leaves inherit the `startNoEarlierThan` (unless their start
 * has happened) and `finishNoLaterThan` of their summaries; summaries get their children and leaf ranges. Iterative,
 * so deep hierarchies do not exhaust the call stack.
 */
function buildHierarchy(
  list: readonly ScheduleTask[], tasks: Map<string, ModelTask>, inactive: Set<string>, started: ReadonlySet<string> | undefined,
) {
  const { children, roots } = checkSummaryHierarchy(list)
  const pre = new Map<string, number>(), post = new Map<string, number>()
  const leaves: string[] = [], summaries: string[] = []
  type Frame = { task: ScheduleTask; next: number; off: boolean; first: number; startLower?: Bound; endUpper?: Bound }
  const tighter = (inherited: Bound | undefined, value: number | undefined, constraint: ScheduleConstraintName, id: string, lower: boolean) =>
    value === undefined || (inherited && (lower ? inherited.value >= value : inherited.value <= value))
      ? inherited : { value, constraint, summaryId: id }
  let counter = 0
  const stack: Frame[] = []
  const enter = (task: ScheduleTask) => {
    const parent = stack.at(-1)
    pre.set(task.id, counter++)
    const off = Boolean(parent?.off) || inactive.has(task.id)
    const frame: Frame = { task, next: 0, off, first: leaves.length }
    const model = tasks.get(task.id)
    if (off) {
      inactive.add(task.id)
      tasks.delete(task.id)
    } else if (parent) model!.parent = parent.task.id
    if (children.has(task.id)) {
      frame.startLower = tighter(parent?.startLower, task.startNoEarlierThan, 'startNoEarlierThan', task.id, true)
      frame.endUpper = tighter(parent?.endUpper, task.finishNoLaterThan, 'finishNoLaterThan', task.id, false)
    } else if (!off) {
      leaves.push(task.id)
      if (parent?.startLower && !started?.has(task.id)) model!.bounds.startLower.push(parent.startLower)
      if (parent?.endUpper) model!.bounds.endUpper.push(parent.endUpper)
    }
    stack.push(frame)
  }
  for (const root of roots) {
    enter(root)
    while (stack.length) {
      const frame = stack.at(-1)!
      const group = children.get(frame.task.id)
      if (group && frame.next < group.length) {
        enter(group[frame.next++]!)
        continue
      }
      stack.pop()
      post.set(frame.task.id, counter++)
      const model = tasks.get(frame.task.id)
      if (!group || !model) continue
      if (frame.first === leaves.length) {
        // A summary whose subtasks are all inactive has no dates, so it is inactive too.
        inactive.add(frame.task.id)
        tasks.delete(frame.task.id)
        continue
      }
      model.alap = false
      model.summary = { children: group.filter(child => tasks.has(child.id)).map(child => child.id), first: frame.first, last: leaves.length }
      summaries.push(frame.task.id)
    }
  }
  return {
    leaves,
    summaries,
    isSummary: (id: string) => children.has(id),
    isAncestor: (ancestor: string, id: string) => pre.get(ancestor)! < pre.get(id)! && post.get(ancestor)! > post.get(id)!,
  }
}

/** The span of a summary's children in `slots`. */
export function summarySlot(task: ModelTask, slots: ReadonlyMap<string, TimeRange>): Slot {
  let start = Infinity, end = -Infinity
  for (const id of task.summary!.children) {
    const slot = slots.get(id)!
    start = Math.min(start, slot.start)
    end = Math.max(end, slot.end)
  }
  return { start, end, workStart: 0 }
}

/** Roll up the summaries of `slots` from their children, in topological order. */
export function rollUpSummaries(model: ScheduleModel, order: readonly string[], slots: Map<string, Slot>): void {
  for (const id of order) {
    const task = model.tasks.get(id)!
    if (task.summary) slots.set(id, summarySlot(task, slots))
  }
}

/**
 * Upper bounds that a summary passes down to its subtasks. `end` binds the finish of every subtask; `start` binds only
 * the subtasks whose earliest start is the summary's earliest start, because the summary starts with the earliest one.
 */
export type SummaryUpper = { end: Bound[]; start: Bound[] }

function lowest(bounds: Bound[]): Bound[] {
  const value = bounds.reduce((min, bound) => Math.min(min, bound.value), Infinity)
  return bounds.filter(bound => bound.value === value)
}

/**
 * The upper bounds of a summary: those its parent passes down, plus those of its outgoing links measured against the
 * successors in `placed`. With `meetManual`, a link into a manual task also binds when the summary's earliest dates
 * already meet it (as for ALAP placement); otherwise links into manual tasks bind nothing.
 */
export function summaryUpper(
  model: ScheduleModel, task: ModelTask, placed: ReadonlyMap<string, TimeRange>, inherited: ReadonlyMap<string, SummaryUpper>,
  earliest: ReadonlyMap<string, TimeRange>, meetManual = false,
): SummaryUpper {
  const parent = task.parent === undefined ? undefined : inherited.get(task.parent)
  const end = parent ? [...parent.end] : []
  const start = parent && earliest.get(task.parent!)!.start === earliest.get(task.id)!.start ? [...parent.start] : []
  addSuccessorUpper(task, placed, end, start)
  if (meetManual) addManualUpper(model, task, earliest.get(task.id)!, end, start)
  return { end: lowest(end), start: lowest(start) }
}

/** Push the upper bounds of a task's outgoing links, measured against the successors in `placed`, to `end` or `start`. */
function addSuccessorUpper(task: ModelTask, placed: ReadonlyMap<string, TimeRange>, end: Bound[], start: Bound[]) {
  for (const link of task.outgoing) {
    const successor = placed.get(link.to)!
    const value = (targetFinish(link) ? successor.end : successor.start) - (link.lag ?? 0)
    ;(sourceFinish(link) ? end : start).push({ value, dependencyId: link.id, linkTo: link.to })
  }
}

/**
 * Push the upper bounds of a task's links into manual tasks to `end` or `start`, but only those that its earliest dates
 * `own` already meet, so that placing the task later adds no manual conflict.
 */
export function addManualUpper(model: ScheduleModel, task: ModelTask, own: TimeRange, end: Bound[], start: Bound[]) {
  for (const link of task.manualOutgoing) {
    const manual = model.tasks.get(link.to)!.manual!
    const value = (targetFinish(link) ? manual.end : manual.start) - (link.lag ?? 0)
    if ((sourceFinish(link) ? own.end : own.start) > value) continue
    ;(sourceFinish(link) ? end : start).push({ value, dependencyId: link.id, linkTo: link.to })
  }
}

/** Add the upper bounds that a leaf inherits from its summary tasks. */
export function addSummaryUpper(
  bounds: Bounds, task: ModelTask, inherited: ReadonlyMap<string, SummaryUpper>, earliest: ReadonlyMap<string, TimeRange>,
): Bounds {
  if (task.parent === undefined) return bounds
  const limits = inherited.get(task.parent)!
  bounds.endUpper.push(...limits.end)
  if (earliest.get(task.id)!.start === earliest.get(task.parent)!.start) bounds.startUpper.push(...limits.start)
  return bounds
}

/** The slot of a manual task: its manual dates. */
export function manualSlot(task: ModelTask): Slot {
  const { start, end } = task.manual!
  return { start, end, workStart: task.clock.workAt(start) }
}

/** Every outgoing link of a task, including those to manual tasks. */
export function allOutgoing(task: ModelTask): ScheduleLink[] {
  return task.manualOutgoing.length ? [...task.outgoing, ...task.manualOutgoing] : task.outgoing
}

/** Kahn order, or the strongly connected components that block it. */
export function topologicalOrder(model: ScheduleModel): { order: string[] } | { cycles: ScheduleCycle[] } {
  const { tasks } = model
  // Links into manual tasks bind nothing, but a cycle through them is still a cycle.
  // A summary waits for its children, whose dates it rolls up.
  const remaining = new Map([...tasks].map(([id, task]) =>
    [id, task.incoming.length + task.manualIncoming.length + (task.summary?.children.length ?? 0)]))
  const order = [...remaining].filter(([, count]) => count === 0).map(([id]) => id)
  for (let i = 0; i < order.length; i++) {
    for (const next of successorIds(tasks.get(order[i]!)!)) {
      const count = remaining.get(next)! - 1
      remaining.set(next, count)
      if (!count) order.push(next)
    }
  }
  if (order.length === tasks.size) return { order }
  const ordered = new Set(order)
  return { cycles: findCycles(tasks, model.linkIndex, [...tasks.keys()].filter(id => !ordered.has(id))) }
}

/** The tasks that wait for a task: the targets of its links and its summary task. */
function successorIds(task: ModelTask): string[] {
  const ids = allOutgoing(task).map(link => link.to)
  if (task.parent !== undefined) ids.push(task.parent)
  return ids
}

/** Iterative Tarjan over the unordered tasks. Every link inside a component lies on a cycle. */
function findCycles(tasks: Map<string, ModelTask>, linkIndex: ReadonlyMap<string, number>, candidates: string[]): ScheduleCycle[] {
  const allowed = new Set(candidates)
  const index = new Map<string, number>(), low = new Map<string, number>(), onStack = new Set<string>()
  const stack: string[] = [], components: string[][] = []
  let counter = 0
  const visit = (id: string) => {
    index.set(id, counter)
    low.set(id, counter++)
    stack.push(id)
    onStack.add(id)
  }
  for (const root of candidates) {
    if (index.has(root)) continue
    visit(root)
    const frames = [{ id: root, edge: 0, outgoing: successorIds(tasks.get(root)!) }]
    while (frames.length) {
      const frame = frames.at(-1)!
      const outgoing = frame.outgoing
      if (frame.edge < outgoing.length) {
        const next = outgoing[frame.edge++]!
        if (!allowed.has(next)) continue
        if (!index.has(next)) {
          visit(next)
          frames.push({ id: next, edge: 0, outgoing: successorIds(tasks.get(next)!) })
        } else if (onStack.has(next)) low.set(frame.id, Math.min(low.get(frame.id)!, index.get(next)!))
        continue
      }
      frames.pop()
      const parent = frames.at(-1)
      if (parent) low.set(parent.id, Math.min(low.get(parent.id)!, low.get(frame.id)!))
      if (low.get(frame.id) === index.get(frame.id)) {
        const component: string[] = []
        let member: string
        do {
          member = stack.pop()!
          onStack.delete(member)
          component.push(member)
        } while (member !== frame.id)
        components.push(component)
      }
    }
  }
  const position = (id: string) => tasks.get(id)!.index
  const cycles: ScheduleCycle[] = []
  for (const component of components) {
    const members = new Set(component)
    // A link into a summary is attached to each of its leaves, so the same ID can occur more than once.
    const dependencyIds = new Set<string>()
    for (const id of component) {
      for (const link of allOutgoing(tasks.get(id)!)) if (members.has(link.to)) dependencyIds.add(link.id)
    }
    if (!dependencyIds.size) continue
    const taskIds = component.sort((a, b) => position(a) - position(b))
    cycles.push({ taskIds, dependencyIds: [...dependencyIds].sort((a, b) => linkIndex.get(a)! - linkIndex.get(b)!) })
  }
  return cycles.sort((a, b) => position(a.taskIds[0]!) - position(b.taskIds[0]!))
}

export function cloneBounds(bounds: Bounds): Bounds {
  return {
    startLower: [...bounds.startLower], endLower: [...bounds.endLower],
    startUpper: [...bounds.startUpper], endUpper: [...bounds.endUpper],
  }
}

export function limitsOf(bounds: Bounds): Limits {
  const max = (list: Bound[]) => list.reduce((value, bound) => Math.max(value, bound.value), -Infinity)
  const min = (list: Bound[]) => list.reduce((value, bound) => Math.min(value, bound.value), Infinity)
  return { startLower: max(bounds.startLower), endLower: max(bounds.endLower), startUpper: min(bounds.startUpper), endUpper: min(bounds.endUpper) }
}

/** Own bounds plus lower bounds from placed predecessors. */
export function lowerBounds(task: ModelTask, placed: ReadonlyMap<string, TimeRange>): Bounds {
  const bounds = cloneBounds(task.bounds)
  for (const link of task.incoming) {
    const predecessor = placed.get(link.from)!
    const value = (sourceFinish(link) ? predecessor.end : predecessor.start) + (link.lag ?? 0)
    ;(targetFinish(link) ? bounds.endLower : bounds.startLower).push({ value, dependencyId: link.id })
  }
  return bounds
}

/** Add upper bounds from placed successors and an optional project finish. */
export function addUpperBounds(bounds: Bounds, task: ModelTask, placed: ReadonlyMap<string, TimeRange>, finish?: number): Bounds {
  if (finish !== undefined) bounds.endUpper.push({ value: finish, constraint: 'projectFinish' })
  addSuccessorUpper(task, placed, bounds.endUpper, bounds.startUpper)
  return bounds
}

/**
 * The lower and upper limits that decide a slot. Ties are all kept. Lower and upper limits are compared in working
 * time on the task's clock, the same way `slotFor` places the task; milestones compare elapsed values.
 */
export function bindingKeys(clock: WorkClock, duration: number, limits: Limits): { lower: LimitKey[]; upper: LimitKey[] } {
  const { startLower, endLower, startUpper, endUpper } = limits
  if (duration === 0) {
    const lower = Math.max(startLower, endLower), upper = Math.min(startUpper, endUpper)
    return {
      lower: (['startLower', 'endLower'] as const).filter(key => limits[key] === lower),
      upper: (['startUpper', 'endUpper'] as const).filter(key => limits[key] === upper),
    }
  }
  const lower = { startLower: clock.workAt(startLower), endLower: clock.minFinishWork(endLower) - duration }
  const upper = { startUpper: clock.maxStartWork(startUpper), endUpper: clock.workAt(endUpper) - duration }
  const first = Math.max(lower.startLower, lower.endLower), last = Math.min(upper.startUpper, upper.endUpper)
  return {
    lower: (['startLower', 'endLower'] as const).filter(key => lower[key] === first),
    upper: (['startUpper', 'endUpper'] as const).filter(key => upper[key] === last),
  }
}

/** The bounds of one key at its limit. `range` is dropped when another bound has the same value. */
export function bindingBounds(bounds: Bounds, limits: Limits, key: LimitKey): Bound[] {
  const binding = bounds[key].filter(bound => bound.value === limits[key])
  return binding.some(bound => bound.constraint !== 'range') ? binding.filter(bound => bound.constraint !== 'range') : binding
}

const constraintOrder: readonly ScheduleConstraintName[] = [
  'range', 'startNoEarlierThan', 'startNoLaterThan', 'finishNoEarlierThan', 'finishNoLaterThan',
  'fixedStart', 'deadline', 'projectFinish', 'calendar',
]

/** Name the bounds that conflict for a task without a feasible slot. */
export function diagnose(model: ScheduleModel, task: ModelTask, bounds: Bounds): ScheduleFailure {
  const limits = limitsOf(bounds)
  const { startLower, endLower, startUpper, endUpper } = limits
  const { clock, duration } = task
  let keys: LimitKey[]
  if (startLower > startUpper) keys = ['startLower', 'startUpper']
  else if (endLower > endUpper) keys = ['endLower', 'endUpper']
  else if (startLower > endUpper) keys = ['startLower', 'endUpper']
  else {
    const binding = bindingKeys(clock, duration, limits)
    keys = [...binding.lower, ...binding.upper]
  }
  const constraints = new Set<ScheduleConstraintName>(), dependencyIds = new Set<string>()
  for (const key of keys) {
    for (const bound of bindingBounds(bounds, limits, key)) {
      if (bound.constraint) constraints.add(bound.constraint)
      if (bound.dependencyId) dependencyIds.add(bound.dependencyId)
    }
  }
  if (duration > 0 && slotFor(model.continuous, duration, limits, false)) constraints.add('calendar')
  return {
    ok: false, code: 'infeasible', taskId: task.id,
    constraints: constraintOrder.filter(name => constraints.has(name)),
    dependencyIds: [...dependencyIds].sort((a, b) => model.linkIndex.get(a)! - model.linkIndex.get(b)!),
  }
}
