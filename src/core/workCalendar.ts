import type { TimeRange } from './timeline.js'

export interface WorkCalendar {
  id: string
  periods: readonly TimeRange[]
}

export interface WorkShift {
  startMinute: number
  endMinute: number
}

export interface WeeklyShift extends WorkShift {
  weekday: number
}

export interface WorkWeek {
  weekly: readonly WeeklyShift[]
  utcOffsetMinutes?: number
  exceptions?: Readonly<Record<string, readonly WorkShift[]>>
}

const minuteMs = 60_000
const dayMs = 1440 * minuteMs

export function assertScheduleRange(range: TimeRange) {
  if (!Number.isSafeInteger(range.start) || !Number.isSafeInteger(range.end) || range.end <= range.start
    || !Number.isSafeInteger(range.end - range.start)) throw new RangeError('Invalid scheduling horizon')
}

/** Clip, sort and unite half-open working periods without modifying the inputs. */
export function normalizeWorkPeriods(periods: readonly TimeRange[], range: TimeRange): TimeRange[] {
  assertScheduleRange(range)
  const clipped: TimeRange[] = []
  for (const period of periods) {
    if (!Number.isSafeInteger(period.start) || !Number.isSafeInteger(period.end) || period.end <= period.start) {
      throw new RangeError('Working periods must have finite integer endpoints and positive length')
    }
    const start = Math.max(period.start, range.start), end = Math.min(period.end, range.end)
    if (start < end) clipped.push({ start, end })
  }
  clipped.sort((a, b) => a.start - b.start || a.end - b.end)
  const merged: TimeRange[] = []
  for (const period of clipped) {
    const previous = merged.at(-1)
    if (previous && period.start <= previous.end) previous.end = Math.max(previous.end, period.end)
    else merged.push(period)
  }
  return merged
}

function checkShift(shift: WorkShift) {
  const { startMinute, endMinute } = shift
  if (![startMinute, endMinute].every(Number.isInteger) || startMinute < 0 || startMinute >= 1440
    || endMinute <= startMinute || endMinute - startMinute > 1440) {
    throw new RangeError('Invalid shift minutes')
  }
}

/** Build epoch-millisecond periods for a weekly calendar in a fixed UTC offset. */
export function buildWorkPeriods(range: TimeRange, week: WorkWeek): TimeRange[] {
  assertScheduleRange(range)
  const offset = week.utcOffsetMinutes ?? 0
  if (!Number.isInteger(offset) || Math.abs(offset) > 840) throw new RangeError('Invalid fixed UTC offset')
  const offsetMs = offset * minuteMs
  const firstDay = Math.floor((range.start + offsetMs) / dayMs) * dayMs
  const lastDay = Math.floor((range.end - 1 + offsetMs) / dayMs) * dayMs
  // Bound civil-date generation. Explicit periods have no such day count limit.
  if (!Number.isFinite(new Date(firstDay - dayMs).getTime()) || !Number.isFinite(new Date(lastDay + dayMs).getTime())
    || lastDay - firstDay > 3660 * dayMs) throw new RangeError('Calendar horizon must be within 3,661 civil dates')

  const weekly: WorkShift[][] = Array.from({ length: 7 }, () => [])
  for (const shift of week.weekly) {
    checkShift(shift)
    if (!Number.isInteger(shift.weekday) || shift.weekday < 0 || shift.weekday > 6) throw new RangeError('Invalid weekday')
    weekly[shift.weekday]!.push(shift)
  }
  const exceptions = new Map(Object.entries(week.exceptions ?? {}))
  for (const [date, shifts] of exceptions) {
    const instant = new Date(date + 'T00:00:00Z')
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(instant.getTime()) || instant.toISOString().slice(0, 10) !== date) {
      throw new RangeError('Invalid calendar exception date: ' + date)
    }
    shifts.forEach(checkShift)
  }
  function shiftsOn(localDay: number) {
    const date = new Date(localDay)
    return exceptions.get(date.toISOString().slice(0, 10)) ?? weekly[date.getUTCDay()]!
  }

  const periods: TimeRange[] = []
  for (let day = firstDay; day <= lastDay; day += dayMs) {
    const midnight = day - offsetMs
    for (const shift of shiftsOn(day)) {
      periods.push({ start: midnight + shift.startMinute * minuteMs, end: midnight + Math.min(1440, shift.endMinute) * minuteMs })
    }
    // An override owns its whole civil date, including any carry-in from a night shift.
    if (exceptions.has(new Date(day).toISOString().slice(0, 10))) continue
    for (const shift of shiftsOn(day - dayMs)) {
      if (shift.endMinute > 1440) periods.push({ start: midnight, end: midnight + (shift.endMinute - 1440) * minuteMs })
    }
  }
  return normalizeWorkPeriods(periods, range)
}
