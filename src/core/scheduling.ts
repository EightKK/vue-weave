import { assertScheduleRange, normalizeWorkPeriods, type WorkCalendar } from './workCalendar.js'
import type { TimeRange } from './timeline.js'
import type { TimelineDependency } from './types.js'

export interface ScheduleTask {
  id: string
  duration: number
  calendarId?: string
  startNoEarlierThan?: number
  startNoLaterThan?: number
  finishNoEarlierThan?: number
  finishNoLaterThan?: number
  fixedStart?: number
}

export interface ScheduleLink extends TimelineDependency {
  /** Elapsed time. Negative values allow overlap. */
  lag?: number
}

export interface ScheduleInput {
  range: TimeRange
  quantum?: number
  calendars?: readonly WorkCalendar[]
  defaultCalendarId?: string
  tasks: readonly ScheduleTask[]
  dependencies?: readonly ScheduleLink[]
  deadline?: number
}

export interface ScheduledTask extends TimeRange {
  id: string
  work: readonly TimeRange[]
  latestStart: number
  latestEnd: number
  totalFloat: number
  /** Float in working time on the task's calendar. Unlike `totalFloat`, this is also working time for milestones. */
  workFloat: number
  critical: boolean
}

export type ScheduleResult =
  | { ok: true; finish: number; tasks: readonly ScheduledTask[]; criticalDependencyIds: readonly string[] }
  | { ok: false; code: 'cycle' }
  | { ok: false; code: 'infeasible'; taskId: string }

type Limits = { startLower: number; endLower: number; startUpper: number; endUpper: number }
type Slot = TimeRange & { workStart: number }

function firstIndex(length: number, matches: (index: number) => boolean) {
  let left = 0, right = length
  while (left < right) {
    const middle = left + Math.floor((right - left) / 2)
    if (matches(middle)) right = middle
    else left = middle + 1
  }
  return left
}

/** Work starts and finishes have different inverses at shift boundaries. */
function workClock(periods: readonly TimeRange[], quantum: number) {
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
  return { total, workAt, dateAt, minFinishWork, maxStartWork, slices }
}
type WorkClock = ReturnType<typeof workClock>

function slotAt(clock: WorkClock, start: number, duration: number): Slot | undefined {
  if (start < 0 || start + duration > clock.total) return undefined
  return { start: clock.dateAt(start, false), end: clock.dateAt(start + duration, true), workStart: start }
}

function slotFor(clock: WorkClock, duration: number, limits: Limits, latest: boolean): Slot | undefined {
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

function sourceFinish(link: ScheduleLink) {
  return (link.type ?? 'FS')[0] === 'F'
}
function targetFinish(link: ScheduleLink) {
  return (link.type ?? 'FS')[1] === 'F'
}

/** Calculate earliest and latest feasible dates without changing the supplied plan. */
export function scheduleTasks(input: ScheduleInput): ScheduleResult {
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
  const tasks = new Map<string, { clock: WorkClock; duration: number; limits: Limits; incoming: ScheduleLink[]; outgoing: ScheduleLink[] }>()
  for (const task of input.tasks) {
    if (!task.id || tasks.has(task.id)) throw new Error('Invalid or duplicate task ID: ' + task.id)
    if (!Number.isSafeInteger(task.duration) || task.duration < 0 || task.duration % quantum !== 0) throw new RangeError('Invalid task duration: ' + task.id)
    const { startNoEarlierThan, startNoLaterThan, finishNoEarlierThan, finishNoLaterThan, fixedStart } = task
    for (const value of [startNoEarlierThan, startNoLaterThan, finishNoEarlierThan, finishNoLaterThan, fixedStart]) validateTime(value)
    tasks.set(task.id, {
      clock: task.calendarId === undefined ? defaultCalendar : calendarFor(task.calendarId),
      duration: task.duration / quantum,
      limits: {
        startLower: Math.max(range.start, startNoEarlierThan ?? -Infinity, fixedStart ?? -Infinity),
        endLower: Math.max(range.start, finishNoEarlierThan ?? -Infinity),
        startUpper: Math.min(range.end, startNoLaterThan ?? Infinity, fixedStart ?? Infinity),
        endUpper: Math.min(range.end, deadline ?? Infinity, finishNoLaterThan ?? Infinity),
      },
      incoming: [], outgoing: [],
    })
  }
  const linkIds = new Set<string>()
  for (const link of dependencies) {
    const from = tasks.get(link.from), to = tasks.get(link.to)
    if (!link.id || linkIds.has(link.id) || !from || !to) throw new Error('Invalid or duplicate schedule dependency: ' + link.id)
    if (!['FS', 'SS', 'FF', 'SF'].includes(link.type ?? 'FS')) throw new Error('Invalid schedule dependency type: ' + link.id)
    const lag = link.lag ?? 0
    if (!Number.isSafeInteger(lag) || lag % quantum !== 0) throw new RangeError('Invalid schedule dependency lag: ' + link.id)
    linkIds.add(link.id)
    from.outgoing.push(link)
    to.incoming.push(link)
  }

  const remaining = new Map([...tasks].map(([id, task]) => [id, task.incoming.length]))
  const order = [...remaining].filter(([, count]) => count === 0).map(([id]) => id)
  for (let i = 0; i < order.length; i++) {
    for (const link of tasks.get(order[i]!)!.outgoing) {
      const count = remaining.get(link.to)! - 1
      remaining.set(link.to, count)
      if (!count) order.push(link.to)
    }
  }
  if (order.length !== tasks.size) return { ok: false, code: 'cycle' }

  const earliest = new Map<string, Slot>()
  let finish = range.start
  for (const id of order) {
    const task = tasks.get(id)!
    const limits = { ...task.limits }
    for (const link of task.incoming) {
      const predecessor = earliest.get(link.from)!
      const lower = (sourceFinish(link) ? predecessor.end : predecessor.start) + (link.lag ?? 0)
      if (targetFinish(link)) limits.endLower = Math.max(limits.endLower, lower)
      else limits.startLower = Math.max(limits.startLower, lower)
    }
    const slot = slotFor(task.clock, task.duration, limits, false)
    if (!slot) return { ok: false, code: 'infeasible', taskId: id }
    earliest.set(id, slot)
    finish = Math.max(finish, slot.end)
  }

  const latest = new Map<string, Slot>()
  for (let i = order.length - 1; i >= 0; i--) {
    const id = order[i]!
    const task = tasks.get(id)!
    const limits = { ...task.limits, endUpper: Math.min(task.limits.endUpper, finish) }
    for (const link of task.outgoing) {
      const successor = latest.get(link.to)!
      const upper = (targetFinish(link) ? successor.end : successor.start) - (link.lag ?? 0)
      if (sourceFinish(link)) limits.endUpper = Math.min(limits.endUpper, upper)
      else limits.startUpper = Math.min(limits.startUpper, upper)
    }
    const slot = slotFor(task.clock, task.duration, limits, true)
    if (!slot) return { ok: false, code: 'infeasible', taskId: id }
    latest.set(id, slot)
  }

  const result = input.tasks.map(({ id }) => {
    const task = tasks.get(id)!
    const early = earliest.get(id)!, late = latest.get(id)!
    const totalFloat = task.duration === 0 ? late.start - early.start : (late.workStart - early.workStart) * quantum
    const workFloat = task.duration === 0
      ? (task.clock.workAt(late.start) - task.clock.workAt(early.start)) * quantum : totalFloat
    return {
      id, start: early.start, end: early.end, work: task.duration ? task.clock.slices(early) : [],
      latestStart: late.start, latestEnd: late.end, totalFloat, workFloat, critical: totalFloat === 0,
    }
  })
  const criticalIds = new Set(result.filter(task => task.critical).map(task => task.id))
  const criticalDependencyIds = dependencies.filter(link => {
    if (!criticalIds.has(link.from) || !criticalIds.has(link.to)) return false
    const from = earliest.get(link.from)!, to = earliest.get(link.to)!, task = tasks.get(link.to)!
    const lower = (sourceFinish(link) ? from.end : from.start) + (link.lag ?? 0)
    const end = targetFinish(link)
    const endpoint = end ? to.end : to.start
    if (lower < range.start) return false
    if (!task.duration) return lower === endpoint
    const work = end ? task.clock.minFinishWork(lower) : task.clock.workAt(lower)
    if (work > task.clock.total || (!end && work === task.clock.total)) return false
    return task.clock.dateAt(work, end) === endpoint
  }).map(link => link.id)
  return { ok: true, finish, tasks: result, criticalDependencyIds }
}
