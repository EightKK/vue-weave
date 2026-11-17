// Internal scheduling model shared by scheduleTasks and levelResources. Not part of the public entry.
import type {
  ScheduleConstraintName, ScheduleCycle, ScheduleInput, ScheduleLink, ScheduleTask, ScheduleFailure,
} from './scheduling.js'
import type { TimeRange } from './timeline.js'
import { assertScheduleRange, normalizeWorkPeriods } from './workCalendar.js'

export type Limits = { startLower: number; endLower: number; startUpper: number; endUpper: number }
export type LimitKey = keyof Limits
/** A bound without a constraint or dependency is a leveling horizon bound. */
export type Bound = { value: number; constraint?: ScheduleConstraintName; dependencyId?: string }
export type Bounds = Record<LimitKey, Bound[]>
export type Slot = TimeRange & { workStart: number }

export function firstIndex(length: number, matches: (index: number) => boolean) {
  let left = 0, right = length
  while (left < right) {
    const middle = left + Math.floor((right - left) / 2)
    if (matches(middle)) right = middle
    else left = middle + 1
  }
  return left
}

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

/** Remove half-open cuts from sorted, disjoint periods. Both inputs must be normalized. */
export function subtractPeriods(periods: readonly TimeRange[], cuts: readonly TimeRange[]): TimeRange[] {
  const result: TimeRange[] = []
  let c = 0
  for (const period of periods) {
    let start = period.start
    while (c < cuts.length && cuts[c]!.end <= start) c++
    for (let i = c; i < cuts.length && cuts[i]!.start < period.end; i++) {
      const cut = cuts[i]!
      if (cut.start > start) result.push({ start, end: cut.start })
      start = Math.max(start, cut.end)
    }
    if (start < period.end) result.push({ start, end: period.end })
  }
  return result
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
}

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
  for (const calendar of input.calendars ?? []) {
    if (!calendar.id || calendars.has(calendar.id)) throw new Error('Invalid or duplicate calendar ID: ' + calendar.id)
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
    if (!task.id || ids.has(task.id)) throw new Error('Invalid or duplicate task ID: ' + task.id)
    ids.add(task.id)
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
  const linkIndex = new Map<string, number>()
  for (const link of dependencies) {
    if (!link.id || linkIndex.has(link.id) || !ids.has(link.from) || !ids.has(link.to)) {
      throw new Error('Invalid or duplicate schedule dependency: ' + link.id)
    }
    if (!['FS', 'SS', 'FF', 'SF'].includes(link.type ?? 'FS')) throw new Error('Invalid schedule dependency type: ' + link.id)
    const lag = link.lag ?? 0
    if (!Number.isSafeInteger(lag) || lag % quantum !== 0) throw new RangeError('Invalid schedule dependency lag: ' + link.id)
    linkIndex.set(link.id, linkIndex.size)
    // A link that touches an inactive task takes no part; a link into a manual task binds nothing.
    const from = tasks.get(link.from), to = tasks.get(link.to)
    if (!from || !to) continue
    if (to.manual) {
      from.manualOutgoing.push(link)
      to.manualIncoming.push(link)
    } else {
      from.outgoing.push(link)
      to.incoming.push(link)
    }
  }
  return { range, quantum, tasks, continuous, linkIndex, validateTime, inactive }
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
  const remaining = new Map([...tasks].map(([id, task]) => [id, task.incoming.length + task.manualIncoming.length]))
  const order = [...remaining].filter(([, count]) => count === 0).map(([id]) => id)
  for (let i = 0; i < order.length; i++) {
    for (const link of allOutgoing(tasks.get(order[i]!)!)) {
      const count = remaining.get(link.to)! - 1
      remaining.set(link.to, count)
      if (!count) order.push(link.to)
    }
  }
  if (order.length === tasks.size) return { order }
  const ordered = new Set(order)
  return { cycles: findCycles(tasks, model.linkIndex, [...tasks.keys()].filter(id => !ordered.has(id))) }
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
    const frames = [{ id: root, edge: 0, outgoing: allOutgoing(tasks.get(root)!) }]
    while (frames.length) {
      const frame = frames.at(-1)!
      const outgoing = frame.outgoing
      if (frame.edge < outgoing.length) {
        const next = outgoing[frame.edge++]!.to
        if (!allowed.has(next)) continue
        if (!index.has(next)) {
          visit(next)
          frames.push({ id: next, edge: 0, outgoing: allOutgoing(tasks.get(next)!) })
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
    const dependencyIds: string[] = []
    for (const id of component) {
      for (const link of allOutgoing(tasks.get(id)!)) if (members.has(link.to)) dependencyIds.push(link.id)
    }
    if (!dependencyIds.length) continue
    const taskIds = component.sort((a, b) => position(a) - position(b))
    cycles.push({ taskIds, dependencyIds: dependencyIds.sort((a, b) => linkIndex.get(a)! - linkIndex.get(b)!) })
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
  for (const link of task.outgoing) {
    const successor = placed.get(link.to)!
    const value = (targetFinish(link) ? successor.end : successor.start) - (link.lag ?? 0)
    ;(sourceFinish(link) ? bounds.endUpper : bounds.startUpper).push({ value, dependencyId: link.id })
  }
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
