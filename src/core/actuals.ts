import { subtractPeriods, uniteRanges, uniteSorted } from './intervals.js'
import { withContext } from './ids.js'
import {
  buildScheduleModel, checkScheduleInterval, checkStatusDate, isMapLike, sourceFinish, targetFinish, type ScheduleModel,
} from './scheduleModel.js'
import {
  scheduleTasks, type ScheduleFailure, type ScheduleInput, type ScheduleLink, type ScheduleResult, type ScheduleSuccess, type ScheduleTask,
  type ScheduledTask,
} from './scheduling.js'
import { toPlanningDiagnostics, type PlanningDiagnostic, type PlanningDiagnosticSeverity } from './scheduleDiagnostics.js'
import { scheduleWithModel } from './schedulePasses.js'
import { timelineBaselineId, type TimeRange } from './timeline.js'
import type { ChartTone, TimelineBar } from './types.js'
import type { EntityRef } from './viewBindings.js'

/** What has actually happened to one task, as recorded at the status date. */
export interface TaskActuals {
  /**
   * Recorded working intervals, half-open `[start, end)` in absolute time: for example a start, an interruption and a
   * resume give two intervals. They are kept exactly as given, also on non-working time. Each must have `end > start`,
   * align with the horizon and quantum, and lie inside `input.range`.
   */
  intervals: readonly TimeRange[]
  /**
   * Working time still to do, in the input's units on the task's calendar (a multiple of the quantum). When omitted, it
   * is the task's `duration` minus the elapsed length of its actual intervals (overlaps counted once), but at least 0.
   */
  remainingWork?: number
  /** The task is complete: it has no remaining work and ends at the end of its last actual interval. */
  finished?: boolean
}

/**
 * `actual-overlap`: two actual intervals of a task overlap (error). `actual-after-status-date`: an actual interval lies
 * after the status date (warning). `actual-outside-calendar`: an actual interval covers time that is not working time of
 * the task's calendar after pauses (warning). `actual-contradiction`: a task is `finished` but has a positive
 * `remainingWork` (error).
 */
export type ActualsDiagnosticCode = 'actual-overlap' | 'actual-after-status-date' | 'actual-outside-calendar' | 'actual-contradiction'

/** A problem of recorded actuals, shaped like a `PlanningDiagnostic` so that both can go in one list. */
export interface ActualsDiagnostic {
  /** Stable for the same problem: a JSON array of the code, the task ID and the range, if any. */
  id: string
  code: ActualsDiagnosticCode
  severity: PlanningDiagnosticSeverity
  /** The task, as `{ kind: 'task', id }`. */
  entities: readonly EntityRef[]
  /** The overlapping, late or off-calendar part. */
  range?: TimeRange
  /** Always empty; present for compatibility with `PlanningDiagnostic`. */
  reasonIds: readonly string[]
}

/** `not-started`: no actual interval. `finished`: actuals and no remaining work. `in-progress`: actuals and remaining work. */
export type ActualsTaskState = 'not-started' | 'in-progress' | 'finished'

/** One task of `rescheduleFromActuals`: what happened, what remains and how it compares with the plan. */
export interface ActualsTask {
  id: string
  state: ActualsTaskState
  /** The recorded actual intervals, in input order and with the input values (copies). Empty for summaries. */
  actual: readonly TimeRange[]
  /**
   * The forecast work of the remaining work: the working segments the scheduler placed. Empty for a finished, manual or
   * summary task, for a milestone, and when the schedule failed.
   */
  remaining: readonly TimeRange[]
  /** Elapsed length of the actual intervals, overlaps counted once. For a summary, the sum over its leaf subtasks. */
  performedWork: number
  /** Remaining working time that was scheduled. 0 for finished and manual tasks; a summary sums its leaf subtasks. */
  remainingWork: number
  /**
   * The forecast dates: from the first actual start (or the forecast start of an unstarted task) to the forecast finish
   * (or the last actual end of a finished task). When the schedule failed, the span of the actuals; absent without them.
   */
  start?: number
  end?: number
  /** The dates of the same task in `plan`, when the plan succeeded. */
  plan?: TimeRange
  /** Parts of the actual intervals outside the task's working time (calendar after pauses), merged and sorted. */
  offCalendar: readonly TimeRange[]
  parentId?: string
  summary?: true
  manual?: true
}

/** The result of `rescheduleFromActuals`; `ok` is `schedule.ok`, so checking it narrows `schedule`. */
export type RescheduleFromActualsResult =
  | RescheduleFromActualsFields & { ok: true; schedule: ScheduleSuccess }
  | RescheduleFromActualsFields & { ok: false; schedule: ScheduleFailure }

/** The fields of `RescheduleFromActualsResult`. */
export interface RescheduleFromActualsFields {
  ok: boolean
  statusDate: number
  /**
   * The forecast schedule: a `ScheduleResult` for the same tasks and links. A started task spans from its first actual
   * start to its forecast finish, and its `work` lists its actual intervals (sorted by start) and then its remaining
   * work; its latest dates and float describe the remaining work. A finished task has its actual span, latest dates equal
   * to its dates, no float and is not critical. A failure names tasks and links of the input.
   */
  schedule: ScheduleResult
  /** `scheduleTasks(input)`: the original plan, for comparison. */
  plan: ScheduleResult
  /** One entry per active task, in input order. Inactive tasks are left out. */
  tasks: readonly ActualsTask[]
  /**
   * The actuals diagnostics, task by task in input order, then `toPlanningDiagnostics(schedule)`: an infeasible or
   * cyclic forecast, or the manual conflicts of a successful one.
   */
  diagnostics: readonly (ActualsDiagnostic | PlanningDiagnostic)[]
}

interface Recorded {
  sorted: TimeRange[]
  union: TimeRange[]
  performed: number
  remaining: number
  state: ActualsTaskState
}

/**
 * Reschedule a plan from recorded actual intervals at a status date. Unlike `rescheduleFromStatusDate`, which derives
 * done work from a progress share and the plan, the actual intervals are facts: they are never moved, clipped to a
 * calendar or merged with the forecast. Only the remaining work is scheduled, by the same rules as `scheduleTasks`.
 *
 * - **Not started** (no entry, or no intervals): the task starts no earlier than the status date, in addition to its
 *   own bounds and links. An explicit `remainingWork` replaces its duration.
 * - **In progress** (intervals and remaining work): the remaining work starts no earlier than the status date or the
 *   last actual end, whichever is later, on the task's calendar and pauses. As in `rescheduleFromStatusDate`, its start
 *   has happened: its `startNoEarlierThan`, `startNoLaterThan`, `fixedStart`, `mode`, incoming FS and SS links and the
 *   start bounds inherited from its summaries no longer apply. Incoming FF and SF links, finish bounds and the deadline
 *   still bind the finish, so the remaining work may resume later. Outgoing links use the first actual start (SS, SF)
 *   and the forecast finish (FS, FF).
 * - **Finished** (`finished`, or no remaining work): the task spans its actuals and ignores every incoming link and
 *   bound except the project deadline, like a manual task. Successors follow its last actual end.
 *
 * Manual tasks keep their manual dates; their actuals are reported and checked but do not move them. Summary tasks
 * roll up the actual and forecast dates of their subtasks. Entries of inactive tasks are validated and ignored.
 *
 * Contradictions are returned as diagnostics: overlapping intervals of one task, intervals after the status date (the
 * forecast then starts after them), intervals outside working time (kept as recorded) and a finished task with positive
 * `remainingWork` (its `remainingWork` is scheduled). A forecast that cannot meet a bound or link is returned as the
 * failure in `schedule` and as a diagnostic, with the actuals still in `tasks`. Throws a RangeError for a status date
 * that is not finite, aligned or inside `input.range`, for an actual interval that is not finite, aligned with the
 * horizon and quantum, of positive length or inside `input.range` (the scheduler's messages for the same defects in its
 * input, followed by ` (actual interval of task <id>)`), and for an invalid `remainingWork`; and an Error for actuals
 * that are not a Map, an unknown or summary task, an entry without an intervals array, an invalid `finished` flag and a
 * finished task without intervals. The arguments are not modified.
 */
export function rescheduleFromActuals(
  input: ScheduleInput, statusDate: number, actuals: ReadonlyMap<string, TaskActuals>,
): RescheduleFromActualsResult {
  const model = buildScheduleModel(input)
  const { quantum } = model
  checkStatusDate(model, statusDate)
  if (!isMapLike(actuals)) {
    throw new Error('Actuals must be a Map from task ID to recorded actuals, such as new Map([[\'a\', { intervals: [{ start, end }] }]])')
  }
  for (const [id, entry] of actuals) {
    const task = model.tasks.get(id)
    if (!task && !model.inactive.has(id)) throw new Error('Unknown task in actuals: ' + id)
    if (task?.summary) throw new Error('Summary task ' + id + ' cannot have actuals: record them on its subtasks')
    if (!entry || typeof entry !== 'object' || !Array.isArray(entry.intervals)) throw new Error('Actuals need an intervals array: ' + id)
    for (const interval of entry.intervals) {
      if (!interval || typeof interval !== 'object') throw new Error('Invalid actual interval: ' + id)
      withContext('actual interval of task ' + id, () => checkScheduleInterval(model, interval))
    }
    const { remainingWork, finished } = entry
    if (remainingWork !== undefined && (!Number.isSafeInteger(remainingWork) || remainingWork < 0 || remainingWork % quantum)) {
      throw new RangeError('Remaining work must be a non-negative multiple of the quantum: ' + id)
    }
    if (finished !== undefined && typeof finished !== 'boolean') throw new Error('Invalid finished flag: ' + id)
    if (finished && !entry.intervals.length) throw new Error('A finished task needs at least one actual interval: ' + id)
  }

  const diagnostics: (ActualsDiagnostic | PlanningDiagnostic)[] = []
  const report = (code: ActualsDiagnosticCode, severity: PlanningDiagnosticSeverity, id: string, part?: TimeRange) => {
    const diagnostic: ActualsDiagnostic = {
      id: JSON.stringify(part ? [code, id, part.start, part.end] : [code, id]), code, severity, entities: [{ kind: 'task', id }], reasonIds: [],
    }
    if (part) diagnostic.range = { start: part.start, end: part.end }
    diagnostics.push(diagnostic)
  }
  const recorded = new Map<string, Recorded>()
  const offCalendar = new Map<string, TimeRange[]>()
  for (const task of input.tasks) {
    const modelled = model.tasks.get(task.id)
    if (!modelled || modelled.summary) continue
    const entry = actuals.get(task.id)
    const sorted = (entry?.intervals ?? []).map(({ start, end }) => ({ start, end })).sort((a, b) => a.start - b.start || a.end - b.end)
    const overlaps: TimeRange[] = []
    const union = uniteSorted(sorted, overlaps)
    const performed = union.reduce((sum, part) => sum + part.end - part.start, 0)
    let remaining: number
    if (modelled.manual) remaining = 0
    else if (entry?.finished) {
      remaining = entry.remainingWork ?? 0
      if (remaining > 0) report('actual-contradiction', 'error', task.id)
    } else if (entry?.remainingWork !== undefined) remaining = entry.remainingWork
    else remaining = sorted.length ? Math.max(0, task.duration - performed) : task.duration
    // A manual task has no remaining work to schedule; only its `finished` flag tells whether it is complete.
    const done = modelled.manual ? Boolean(entry?.finished) : remaining === 0
    const state: ActualsTaskState = !sorted.length ? 'not-started' : done ? 'finished' : 'in-progress'
    recorded.set(task.id, { sorted, union, performed, remaining, state })
    for (const part of overlaps) report('actual-overlap', 'error', task.id, part)
    for (const part of union) if (part.end > statusDate) report('actual-after-status-date', 'warning', task.id, { start: Math.max(part.start, statusDate), end: part.end })
    const off = subtractPeriods(union, modelled.clock.periods)
    offCalendar.set(task.id, off)
    for (const part of off) report('actual-outside-calendar', 'warning', task.id, part)
  }

  // The adjusted plan. A started task keeps its remaining work under its own ID; a manual milestone at its first actual
  // start stands in for its start, so that links from its start and the rollup of its summaries use the actual start.
  const ids = new Set(input.tasks.map(task => task.id))
  const startStandIns = new Map<string, string>()
  const finished = new Set<string>()
  const tasks: ScheduleTask[] = []
  for (const task of input.tasks) {
    const modelled = model.tasks.get(task.id)
    const info = recorded.get(task.id)
    if (!modelled || !info || modelled.manual) {
      tasks.push(task)
      continue
    }
    const { startNoEarlierThan, startNoLaterThan: _late, fixedStart: _fixed, mode: _mode, ...rest } = task
    if (info.state === 'not-started') {
      tasks.push({ ...task, duration: info.remaining, startNoEarlierThan: Math.max(startNoEarlierThan ?? statusDate, statusDate) })
      continue
    }
    const first = info.sorted[0]!.start
    const last = info.union.at(-1)!.end
    if (info.state === 'finished') {
      finished.add(task.id)
      tasks.push({ ...rest, manual: { start: first, end: last } })
      continue
    }
    let standIn = task.id + '\u0000actual-start'
    while (ids.has(standIn)) standIn += '\u0000'
    ids.add(standIn)
    startStandIns.set(task.id, standIn)
    tasks.push({ ...rest, duration: info.remaining, startNoEarlierThan: Math.max(statusDate, last) })
    const marker: ScheduleTask = { id: standIn, duration: 0, manual: { start: first, end: first } }
    if (task.parentId !== undefined) marker.parentId = task.parentId
    tasks.push(marker)
  }
  const dependencies: ScheduleLink[] = []
  for (const link of input.dependencies ?? []) {
    if (finished.has(link.to) || (startStandIns.has(link.to) && !targetFinish(link))) continue
    const standIn = sourceFinish(link) ? undefined : startStandIns.get(link.from)
    dependencies.push(standIn ? { ...link, from: standIn } : link)
  }
  const started = new Set([...finished, ...startStandIns.keys(), ...startStandIns.values()])
  const remainingInput = { ...input, tasks, dependencies }
  const raw = scheduleWithModel(remainingInput, buildScheduleModel(remainingInput, false, started), false)
  const plan = scheduleTasks(input)

  const owner = new Map([...startStandIns].map(([id, standIn]) => [standIn, id]))
  const real = (id: string) => owner.get(id) ?? id
  let schedule: ScheduleResult
  const remainingWork = new Map<string, readonly TimeRange[]>()
  if (raw.ok) {
    const entries: ScheduledTask[] = []
    for (const entry of raw.tasks) {
      if (owner.has(entry.id)) continue
      const info = recorded.get(entry.id)
      if (!info || info.state === 'not-started' || model.tasks.get(entry.id)!.manual) {
        if (info && !entry.manual) remainingWork.set(entry.id, entry.work)
        entries.push(entry)
        continue
      }
      const actual = info.sorted.map(part => ({ ...part }))
      if (info.state === 'finished') {
        const { manual: _manual, ...rest } = entry
        entries.push({ ...rest, work: actual, latestStart: entry.start, latestEnd: entry.end, totalFloat: 0, workFloat: 0, critical: false })
        continue
      }
      remainingWork.set(entry.id, entry.work)
      entries.push({ ...entry, start: info.sorted[0]!.start, work: [...actual, ...entry.work] })
    }
    schedule = { ...raw, tasks: entries }
    const conflicts = raw.manualConflicts?.filter(conflict => !owner.has(conflict.taskId) && !finished.has(conflict.taskId))
    if (raw.manualConflicts) {
      if (conflicts!.length) schedule.manualConflicts = conflicts!
      else delete schedule.manualConflicts
    }
  } else if (raw.code === 'cycle') {
    schedule = {
      ok: false, code: 'cycle',
      cycles: raw.cycles.map(cycle => ({ ...cycle, taskIds: [...new Set(cycle.taskIds.map(real))] })),
    }
  } else schedule = { ...raw, taskId: real(raw.taskId) }
  for (const diagnostic of toPlanningDiagnostics(schedule)) diagnostics.push(diagnostic)

  const scheduled = schedule.ok ? new Map(schedule.tasks.map(task => [task.id, task])) : undefined
  const planned = plan.ok ? new Map(plan.tasks.map(task => [task.id, task])) : undefined
  const results = new Map<string, ActualsTask>()
  const order: ActualsTask[] = []
  for (const task of input.tasks) {
    const modelled = model.tasks.get(task.id)
    if (!modelled) continue
    const info = recorded.get(task.id)
    const entry: ActualsTask = {
      id: task.id, state: info?.state ?? 'not-started', actual: (actuals.get(task.id)?.intervals ?? []).map(({ start, end }) => ({ start, end })),
      remaining: remainingWork.get(task.id) ?? [], performedWork: info?.performed ?? 0,
      remainingWork: modelled.manual ? 0 : info?.remaining ?? 0, offCalendar: offCalendar.get(task.id) ?? [],
    }
    const forecast = scheduled?.get(task.id)
    if (forecast) {
      entry.start = forecast.start
      entry.end = forecast.end
    } else if (info?.union.length) {
      entry.start = info.union[0]!.start
      entry.end = info.union.at(-1)!.end
    }
    const original = planned?.get(task.id)
    if (original) entry.plan = { start: original.start, end: original.end }
    if (modelled.parent !== undefined) entry.parentId = modelled.parent
    if (modelled.summary) entry.summary = true
    if (modelled.manual) entry.manual = true
    results.set(task.id, entry)
    order.push(entry)
  }
  rollUpActuals(model, results)
  const fields = { statusDate, plan, tasks: order, diagnostics }
  return schedule.ok ? { ok: true, schedule, ...fields } : { ok: false, schedule, ...fields }
}

/**
 * Give each summary the state, work and (after a failed schedule) the span of its subtasks. The model lists summaries
 * after their subtasks, so nested summaries roll up without recursion.
 */
function rollUpActuals(model: ScheduleModel, results: ReadonlyMap<string, ActualsTask>) {
  for (const id of model.summaries) {
    const summary = results.get(id)!
    let performed = 0, remaining = 0, started = false, open = false, start = Infinity, end = -Infinity
    for (const childId of model.tasks.get(id)!.summary!.children) {
      const child = results.get(childId)!
      performed += child.performedWork
      remaining += child.remainingWork
      started ||= child.state !== 'not-started'
      open ||= child.state !== 'finished'
      if (child.start !== undefined) start = Math.min(start, child.start)
      if (child.end !== undefined) end = Math.max(end, child.end)
    }
    summary.performedWork = performed
    summary.remainingWork = remaining
    summary.state = !started ? 'not-started' : open ? 'in-progress' : 'finished'
    if (summary.start === undefined && start <= end) {
      summary.start = start
      summary.end = end
    }
  }
}

/** Options of `actualsTimelineBars`. */
export interface ActualsTimelineBarOptions {
  /** The bar label of a task; the part is appended, as in "Cut A · actual". Default: the task ID. */
  label?: (taskId: string) => string
  /** The row of a task. Default: the task ID. */
  rowId?: (taskId: string) => string
  /** The bar ID of one part of a task. Default: `taskId + ':' + part`. */
  barId?: (taskId: string, part: 'actual' | 'forecast') => string
  /** Words appended to the label of each part. Defaults "actual" and "forecast". */
  partLabels?: { actual?: string; forecast?: string }
  /** Bar descriptions of each part. Defaults "Recorded actual work" and "Remaining work forecast". */
  descriptions?: { actual?: string; forecast?: string }
  /** Tones of each part. Defaults: `teal` for actual work and `blue` for the forecast. */
  tones?: { actual?: ChartTone; forecast?: ChartTone }
  /**
   * The baseline set that carries the original plan on the first bar of each task. Default: `timelineBaselineId`, the
   * unnamed `baseline`; any other ID adds a named entry to `baselines`. `false` adds none.
   */
  baselineId?: string | false
}

/**
 * Project a `rescheduleFromActuals` result into GanttChart bars, so that one row shows the original plan, the recorded
 * actuals and the remaining forecast. Each task with actuals gets a solid "actual" bar spanning them, with their merged
 * intervals as `segments` when there are several; each task with work still to do, and each unstarted or manual task,
 * gets an outline "forecast" bar with its remaining work segments. Solid and outline differ without colour, also in
 * forced colours. The plan dates become a baseline of the first bar of the task. Summary tasks get no bar: show their
 * rows with GanttChart `showSummaries`, which rolls up the bars of their subtasks. Without a successful schedule, only
 * actual bars are returned. The result is not modified.
 */
export function actualsTimelineBars(result: RescheduleFromActualsResult, options: ActualsTimelineBarOptions = {}): TimelineBar[] {
  if (!result || typeof result !== 'object' || !Array.isArray(result.tasks)) throw new Error('Invalid rescheduleFromActuals result')
  const label = options.label ?? (id => id)
  const rowId = options.rowId ?? (id => id)
  const barId = options.barId ?? ((id, part) => id + ':' + part)
  const words = { actual: options.partLabels?.actual ?? 'actual', forecast: options.partLabels?.forecast ?? 'forecast' }
  const descriptions = {
    actual: options.descriptions?.actual ?? 'Recorded actual work', forecast: options.descriptions?.forecast ?? 'Remaining work forecast',
  }
  const tones = { actual: options.tones?.actual ?? 'teal', forecast: options.tones?.forecast ?? 'blue' }
  const baselineId = options.baselineId ?? timelineBaselineId
  const scheduled = result.schedule?.ok ? new Map(result.schedule.tasks.map(task => [task.id, task.work])) : undefined
  const bars: TimelineBar[] = []
  for (const task of result.tasks) {
    if (task.summary) continue
    const parts: TimelineBar[] = []
    const merged = uniteRanges(task.actual)
    if (merged.length) {
      const bar: TimelineBar = {
        id: barId(task.id, 'actual'), rowId: rowId(task.id), label: label(task.id) + ' · ' + words.actual,
        start: merged[0]!.start, end: merged.at(-1)!.end, tone: tones.actual, appearance: 'solid', description: descriptions.actual,
      }
      if (merged.length > 1) bar.segments = merged
      parts.push(bar)
    }
    if (task.state !== 'finished' && scheduled && task.start !== undefined && task.end !== undefined) {
      // A manual or unstarted task is forecast as a whole; a started one from the start of its remaining work.
      const whole = task.manual || task.state === 'not-started'
      const work: readonly TimeRange[] = whole ? scheduled.get(task.id) ?? [] : task.remaining
      const start = whole ? task.start : work[0]?.start ?? task.end
      const bar: TimelineBar = {
        id: barId(task.id, 'forecast'), rowId: rowId(task.id), label: label(task.id) + ' · ' + words.forecast,
        start, end: task.end, tone: tones.forecast, appearance: 'outline', description: descriptions.forecast,
      }
      if (work.length > 1 && start < task.end) bar.segments = work.map(part => ({ start: part.start, end: part.end }))
      parts.push(bar)
    }
    if (parts.length && task.plan && baselineId !== false) {
      const plan = { start: task.plan.start, end: task.plan.end }
      if (baselineId === timelineBaselineId) parts[0]!.baseline = plan
      else parts[0]!.baselines = [{ id: baselineId, ...plan }]
    }
    bars.push(...parts)
  }
  return bars
}
