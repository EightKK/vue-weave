import { firstIndex, uniteRanges } from './intervals.js'
import { checkId, uniqueIds, withContext } from './ids.js'
import type { TimeRange } from './timeline.js'
import type { WorkCalendar } from './workCalendar.js'

/**
 * Progress and cost of one task as recorded at an earlier time, for the EV and AC curves of `computeEarnedValue`. The
 * values are cumulative: `progress` is the completed share at `time`, `actualCost` the cost spent up to `time`.
 */
export interface EarnedValueRecord {
  time: number
  /** The completed share at `time`, from 0 to 1, like `TimelineBar.progress`. */
  progress: number
  /** The cost spent up to `time`, at least 0. When omitted, the value of the previous record (0 for the first). */
  actualCost?: number
}

/** One task of `computeEarnedValue`: its budget, its planned (baseline) dates, and its progress and cost so far. */
export interface EarnedValueTask {
  id: string
  /** The budget at completion (BAC) of the task, a finite number ≥ 0 in the caller's currency or effort unit. */
  budget: number
  /** Planned start and end of the baseline, half-open `[start, end)` in the caller's time unit; `end === start` is a milestone. */
  start: number
  end: number
  /**
   * The completed share at the status date, from 0 to 1, like `TimelineBar.progress`. When omitted, the progress of
   * the last `history` record, or 0 without history.
   */
  progress?: number
  /**
   * The actual cost (AC) spent up to the status date, a finite number ≥ 0. When omitted, the cost of the last `history`
   * record, or 0 without history.
   */
  actualCost?: number
  /**
   * A calendar of `EarnedValueOptions.calendars`: the planned value accrues over its working time only. When omitted,
   * `defaultCalendarId` applies; without either, the planned value accrues linearly over elapsed time.
   */
  calendarId?: string
  /**
   * Recorded progress and cost before the status date, sorted by strictly increasing `time`, each at or before the
   * status date. They give the EV and AC curves of the series; they never change the status-date values.
   */
  history?: readonly EarnedValueRecord[]
}

/**
 * How `computeEarnedValue` forecasts the cost of the remaining work (BAC − EV): `cpi` divides it by the CPI (the cost
 * efficiency so far continues), `cpi-spi` by CPI × SPI (cost and schedule efficiency both continue), and `budget`
 * takes it at its budgeted cost (the variance so far does not recur).
 */
export type EarnedValueEacMethod = 'cpi' | 'cpi-spi' | 'budget'

/** The cumulative time series of `computeEarnedValue`, for an S-curve. */
export interface EarnedValueSeriesOptions {
  /** Distance between two points, a finite number > 0 in the time unit. */
  step: number
  /** First point. Default: the earliest planned start. */
  start?: number
  /** Last point. Default: the latest planned end or the status date, whichever is later. */
  end?: number
}

export interface EarnedValueOptions {
  /** The status (data) date: PV counts the planned work in `[start, statusDate)`, EV and AC are the values at this time. */
  statusDate: number
  /** Working periods by calendar, like the calendars of `scheduleTasks`; only `id` and `periods` are read. */
  calendars?: readonly WorkCalendar[]
  /** The calendar of tasks without `calendarId`. */
  defaultCalendarId?: string
  /** Default `cpi`. */
  eacMethod?: EarnedValueEacMethod
  /** Calculate `series`. Without it, `series` is empty. */
  series?: EarnedValueSeriesOptions
}

/** The four base values of earned value management. */
export interface EarnedValueAmounts {
  /** Budget at completion. */
  bac: number
  /** Planned value: the budget of the work planned before the status date. */
  pv: number
  /** Earned value: `progress × bac`. */
  ev: number
  /** Actual cost. */
  ac: number
}

/**
 * The base values and the derived indicators. A ratio whose denominator is zero is left out (undefined), never NaN
 * or Infinity, and so is every value derived from it.
 */
export interface EarnedValueMetrics extends EarnedValueAmounts {
  /** Schedule variance `ev − pv`. */
  sv: number
  /** Cost variance `ev − ac`. */
  cv: number
  /** Schedule performance index `ev / pv`; undefined when `pv` is 0. */
  spi?: number
  /** Cost performance index `ev / ac`; undefined when `ac` is 0. */
  cpi?: number
  /** Estimate at completion `ac + etc`; undefined when `etc` is. */
  eac?: number
  /**
   * Estimate to complete: the remaining work `bac − ev` divided by the index of the EAC method, where an undefined
   * CPI or SPI counts as 1. 0 when no work remains; undefined when work remains and the index is 0.
   */
  etc?: number
  /** Variance at completion `bac − eac`; undefined when `eac` is. */
  vac?: number
  /** To-complete performance index `(bac − ev) / (bac − ac)`; undefined when `bac − ac` is not positive. */
  tcpi?: number
  /** `ev / bac`, from 0 to 1; undefined when `bac` is 0. */
  percentComplete?: number
}

export interface EarnedValueTaskResult extends EarnedValueMetrics {
  id: string
}

/** One point of the cumulative series. `ev` and `ac` are present only up to the status date. */
export interface EarnedValuePoint {
  time: number
  pv: number
  ev?: number
  ac?: number
}

export interface EarnedValueResult {
  statusDate: number
  eacMethod: EarnedValueEacMethod
  /** One entry per task, in input order. */
  tasks: readonly EarnedValueTaskResult[]
  /** `rollupEarnedValue(tasks)`: the sums of the base values, with indicators derived from the sums. */
  totals: EarnedValueMetrics
  /** Sorted by time; empty without `options.series` or without tasks. */
  series: readonly EarnedValuePoint[]
}

/** The largest number of series points `computeEarnedValue` calculates. */
export const maxEarnedValuePoints = 100_000

const eacMethods: readonly EarnedValueEacMethod[] = ['cpi', 'cpi-spi', 'budget']

/** Cumulative working time of merged periods, for the planned value of a task on a calendar. */
interface WorkAxis {
  periods: TimeRange[]
  /** `before[i]`: working time before `periods[i]`. */
  before: number[]
}

/** Working time of `axis` before time `t`. */
function workBefore(axis: WorkAxis, t: number) {
  const index = firstIndex(axis.periods.length, i => axis.periods[i]!.end > t)
  if (index === axis.periods.length) return axis.before[index]!
  const period = axis.periods[index]!
  return axis.before[index]! + Math.max(0, t - period.start)
}

interface PreparedTask {
  id: string
  bac: number
  start: number
  end: number
  progress: number
  ac: number
  axis?: WorkAxis
  /** History records followed by the status-date record, with `actualCost` carried forward. */
  steps: { time: number; ev: number; ac: number }[]
}

function finiteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function show(value: unknown) {
  return typeof value === 'string' ? JSON.stringify(value) : String(value)
}

/**
 * The planned value of one task at `time`: its budget times the share of its planned work before `time`. On a calendar,
 * the share is working time; without one, or when the planned dates hold no working time, it is elapsed time. A
 * milestone accrues its whole budget at its start.
 */
function plannedValue(task: PreparedTask, time: number) {
  const { start, end, bac, axis } = task
  if (time < start) return 0
  if (time >= end) return bac
  if (axis) {
    const total = workBefore(axis, end) - workBefore(axis, start)
    if (total > 0) return bac * (workBefore(axis, time) - workBefore(axis, start)) / total
  }
  return bac * (time - start) / (end - start)
}

/** EV and AC of a task at `time` (at or before the status date): its last record at or before `time`, else 0. */
function recordedAt(task: PreparedTask, time: number) {
  const index = firstIndex(task.steps.length, i => task.steps[i]!.time > time)
  return index === 0 ? { ev: 0, ac: 0 } : task.steps[index - 1]!
}

/**
 * Earned value management (EVM) for a plan at a status date: planned value (PV), earned value (EV) and actual cost
 * (AC) per task, the variances and indices derived from them, their totals and, with `options.series`, the cumulative
 * PV, EV and AC over time for an S-curve.
 *
 * - **PV** is the budget times the share of the task's planned interval `[start, end)` that lies before the status
 *   date. On a calendar it accrues over working time only; otherwise linearly over elapsed time. A task whose planned
 *   dates hold no working time of its calendar accrues over elapsed time. A milestone (`end === start`) accrues its
 *   whole budget at its start: its PV is the budget from `statusDate >= start` on.
 * - **EV** is `progress × budget` and **AC** is `actualCost`, both as reported at the status date.
 * - The indicators follow `EarnedValueMetrics`; a ratio with a zero denominator is undefined, never NaN or Infinity.
 *
 * Totals sum BAC, PV, EV and AC over all tasks and derive the indicators from the sums, so a total SPI is the
 * budget-weighted index and not the mean of the task indices. Pass only leaf tasks: a summary row's values are the
 * rollup of its subtasks (`rollupEarnedValue`), and including both counts the budget twice.
 *
 * In the series, PV is defined at every point. EV and AC are present at the points up to the status date, from each
 * task's `history` records followed by its status-date values, as steps: a task contributes the values of its last
 * record at or before the point, and 0 before its first record. A task without history therefore adds its EV and AC
 * from the status date on. The status date is always a point when it lies inside the series range.
 *
 * Throws a RangeError for a non-finite status date, a budget, actual cost or progress outside its range, planned dates
 * that are not finite or end before they start, history records that are not finite, not increasing or after the
 * status date, invalid calendar periods and invalid series options or a series of more than `maxEarnedValuePoints`
 * points; and an Error for tasks that are not an array, an invalid or duplicate task or calendar ID, an unknown
 * calendar, an invalid history and an unknown EAC method. The arguments are not modified.
 */
export function computeEarnedValue(tasks: readonly EarnedValueTask[], options: EarnedValueOptions): EarnedValueResult {
  if (!Array.isArray(tasks)) throw new Error('Earned value tasks must be an array')
  if (!options || typeof options !== 'object') throw new Error('Earned value options must be an object with a statusDate')
  const { statusDate } = options
  if (!finiteNumber(statusDate)) throw new RangeError(`statusDate must be a finite number (got ${show(statusDate)})`)
  const eacMethod = options.eacMethod ?? 'cpi'
  if (!eacMethods.includes(eacMethod)) throw new Error(`Unknown EAC method: ${show(eacMethod)} (use ${eacMethods.join(', ')})`)

  const axes = new Map<string, WorkAxis>()
  const calendarIds = new Set<string>()
  for (const calendar of options.calendars ?? []) {
    checkId('calendar', calendar?.id, calendarIds)
    if (!Array.isArray(calendar.periods)) throw new Error('Calendar periods must be an array: ' + calendar.id)
    for (const period of calendar.periods) {
      if (!period || !finiteNumber(period.start) || !finiteNumber(period.end) || period.end <= period.start) {
        throw new RangeError('Working periods must have finite endpoints and positive length (calendar ' + calendar.id + ')')
      }
    }
    const periods = uniteRanges(calendar.periods)
    const before = [0]
    for (const period of periods) before.push(before.at(-1)! + period.end - period.start)
    axes.set(calendar.id, { periods, before })
  }
  const axisOf = (id: string) => {
    const axis = axes.get(id)
    if (!axis) throw new Error('Unknown calendar: ' + id)
    return axis
  }
  const defaultAxis = options.defaultCalendarId === undefined ? undefined : axisOf(options.defaultCalendarId)

  uniqueIds(tasks, 'task')
  const prepared = tasks.map((task): PreparedTask => {
    const { id, budget, start, end } = task
    if (!finiteNumber(budget) || budget < 0) throw new RangeError(`Budget of task ${id} must be a finite number ≥ 0 (got ${show(budget)})`)
    if (!finiteNumber(start) || !finiteNumber(end) || end < start) {
      throw new RangeError(`Planned dates of task ${id} must be finite with end ≥ start (got ${show(start)}–${show(end)})`)
    }
    const axis = task.calendarId === undefined ? defaultAxis : withContext('task ' + id, () => axisOf(task.calendarId!))
    const steps: PreparedTask['steps'] = []
    let progress = 0, ac = 0
    if (task.history !== undefined) {
      if (!Array.isArray(task.history)) throw new Error('History must be an array: ' + id)
      for (const record of task.history) {
        if (!record || typeof record !== 'object') throw new Error('Invalid history record: ' + id)
        const { time } = record
        if (!finiteNumber(time) || time > statusDate || (steps.length && time <= steps.at(-1)!.time)) {
          throw new RangeError(`History times of task ${id} must be finite, strictly increasing and not after the status date (got ${show(time)})`)
        }
        progress = checkProgress(record.progress, id + ' (history)')
        if (record.actualCost !== undefined) ac = checkCost(record.actualCost, id + ' (history)')
        steps.push({ time, ev: progress * budget, ac })
      }
    }
    if (task.progress !== undefined) progress = checkProgress(task.progress, id)
    if (task.actualCost !== undefined) ac = checkCost(task.actualCost, id)
    // The status-date values replace a record at the status date.
    if (steps.at(-1)?.time === statusDate) steps.pop()
    steps.push({ time: statusDate, ev: progress * budget, ac })
    const item: PreparedTask = { id, bac: budget, start, end, progress, ac, steps }
    if (axis) item.axis = axis
    return item
  })

  const series = options.series === undefined ? [] : earnedValueSeries(prepared, statusDate, options.series)
  const results = prepared.map((task): EarnedValueTaskResult => ({
    id: task.id, ...deriveMetrics(task.bac, plannedValue(task, statusDate), task.progress * task.bac, task.ac, eacMethod),
  }))
  return { statusDate, eacMethod, tasks: results, totals: rollupEarnedValue(results, { eacMethod }), series }
}

function checkProgress(value: unknown, owner: string): number {
  if (!finiteNumber(value) || value < 0 || value > 1) throw new RangeError('Progress must be between zero and one: ' + owner)
  return value
}

function checkCost(value: unknown, owner: string): number {
  if (!finiteNumber(value) || value < 0) throw new RangeError(`Actual cost must be a finite number ≥ 0: ${owner} (got ${show(value)})`)
  return value
}

function earnedValueSeries(tasks: readonly PreparedTask[], statusDate: number, options: EarnedValueSeriesOptions): EarnedValuePoint[] {
  if (!options || typeof options !== 'object') throw new Error('series must be an object with a step')
  const { step } = options
  if (!finiteNumber(step) || step <= 0) throw new RangeError(`series.step must be a finite number > 0 (got ${show(step)})`)
  if (options.start !== undefined && !finiteNumber(options.start)) {
    throw new RangeError(`series.start must be a finite number (got ${show(options.start)})`)
  }
  if (options.end !== undefined && !finiteNumber(options.end)) throw new RangeError(`series.end must be a finite number (got ${show(options.end)})`)
  if (!tasks.length && (options.start === undefined || options.end === undefined)) return []
  let first = Infinity, last = statusDate
  for (const task of tasks) {
    first = Math.min(first, task.start)
    last = Math.max(last, task.end)
  }
  const start = options.start ?? first
  const end = options.end ?? last
  if (end < start) throw new RangeError(`series.end must be ≥ series.start (got ${show(start)}–${show(end)})`)
  const count = Math.floor((end - start) / step) + 2
  if (count > maxEarnedValuePoints) {
    throw new RangeError(`The series would have more than ${maxEarnedValuePoints} points; use a larger series.step (got ${show(step)})`)
  }
  const times: number[] = []
  for (let k = 0; start + k * step < end; k++) times.push(start + k * step)
  times.push(end)
  if (statusDate >= start && statusDate <= end && !times.includes(statusDate)) {
    times.splice(firstIndex(times.length, i => times[i]! > statusDate), 0, statusDate)
  }
  return times.map(time => {
    const point: EarnedValuePoint = { time, pv: 0 }
    for (const task of tasks) point.pv += plannedValue(task, time)
    if (time <= statusDate) {
      let ev = 0, ac = 0
      for (const task of tasks) {
        const recorded = recordedAt(task, time)
        ev += recorded.ev
        ac += recorded.ac
      }
      point.ev = ev
      point.ac = ac
    }
    return point
  })
}

function deriveMetrics(bac: number, pv: number, ev: number, ac: number, method: EarnedValueEacMethod): EarnedValueMetrics {
  const metrics: EarnedValueMetrics = { bac, pv, ev, ac, sv: ev - pv, cv: ev - ac }
  if (pv > 0) metrics.spi = ev / pv
  if (ac > 0) metrics.cpi = ev / ac
  const remaining = Math.max(0, bac - ev)
  const index = method === 'budget' ? 1 : method === 'cpi' ? metrics.cpi ?? 1 : (metrics.cpi ?? 1) * (metrics.spi ?? 1)
  if (remaining === 0 || index > 0) {
    metrics.etc = remaining === 0 ? 0 : remaining / index
    metrics.eac = ac + metrics.etc
    metrics.vac = bac - metrics.eac
  }
  if (bac - ac > 0) metrics.tcpi = remaining / (bac - ac)
  if (bac > 0) metrics.percentComplete = ev / bac
  return metrics
}

/**
 * The earned value of a group, such as a summary row: the sums of BAC, PV, EV and AC of `items` (for example task
 * results of `computeEarnedValue`), with the indicators derived from the sums by `eacMethod` (default `cpi`). An empty
 * group has all base values 0. Throws an Error when `items` is not an array or the method is unknown, and a
 * RangeError for a base value that is not a finite number ≥ 0. The arguments are not modified.
 */
export function rollupEarnedValue(
  items: readonly EarnedValueAmounts[], options: { eacMethod?: EarnedValueEacMethod } = {},
): EarnedValueMetrics {
  if (!Array.isArray(items)) throw new Error('Earned value items must be an array')
  const method = options.eacMethod ?? 'cpi'
  if (!eacMethods.includes(method)) throw new Error(`Unknown EAC method: ${show(method)} (use ${eacMethods.join(', ')})`)
  let bac = 0, pv = 0, ev = 0, ac = 0
  items.forEach((item, index) => {
    for (const key of ['bac', 'pv', 'ev', 'ac'] as const) {
      const value = item?.[key]
      if (!finiteNumber(value) || value < 0) throw new RangeError(`${key} of earned value item ${index} must be a finite number ≥ 0 (got ${show(value)})`)
    }
    bac += item.bac
    pv += item.pv
    ev += item.ev
    ac += item.ac
  })
  return deriveMetrics(bac, pv, ev, ac, method)
}
