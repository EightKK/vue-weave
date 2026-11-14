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
  /**
   * IANA time zone such as `Europe/Berlin`. Shift minutes are then local wall-clock times,
   * resolved with daylight-saving rules. Cannot be combined with `utcOffsetMinutes`.
   */
  timeZone?: string
  exceptions?: Readonly<Record<string, readonly WorkShift[]>>
}

const minuteMs = 60_000
const dayMs = 1440 * minuteMs

/** The largest fixed UTC offset, in minutes, accepted by `buildWorkPeriods`, `calendarBands` and `toMsProjectXml`. */
export const maxUtcOffsetMinutes = 18 * 60

export function assertScheduleRange(range: TimeRange) {
  if (!Number.isSafeInteger(range.start) || !Number.isSafeInteger(range.end) || range.end <= range.start
    || !Number.isSafeInteger(range.end - range.start)) throw new RangeError('Invalid scheduling horizon')
}

/** Clip, sort and unite half-open working periods without modifying the inputs. */
export function normalizeWorkPeriods(periods: readonly TimeRange[], range: TimeRange): TimeRange[] {
  assertScheduleRange(range)
  return mergePeriods(periods, range, true)
}

/**
 * Clip, sort and unite periods. Scheduling and resource load count whole units, so they need safe integers;
 * `invertWorkPeriods` only compares endpoints and accepts any finite numbers.
 */
function mergePeriods(periods: readonly TimeRange[], range: TimeRange, integers: boolean): TimeRange[] {
  const valid = integers ? Number.isSafeInteger : Number.isFinite
  const clipped: TimeRange[] = []
  for (const period of periods) {
    if (!valid(period.start) || !valid(period.end) || period.end <= period.start) {
      throw new RangeError(integers
        ? 'Working periods must have finite integer endpoints and positive length'
        : 'Working periods must have finite endpoints and positive length')
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

/**
 * The sorted half-open gaps between working periods inside `range`, for example the non-working time to shade on a
 * chart. The periods are clipped, sorted and merged first, so they may be unsorted, overlapping or touching. Unlike
 * `normalizeWorkPeriods`, endpoints only need to be finite, so any numeric unit works, including fractions.
 */
export function invertWorkPeriods(periods: readonly TimeRange[], range: TimeRange): TimeRange[] {
  if (!Number.isFinite(range.start) || !Number.isFinite(range.end) || range.end <= range.start) {
    throw new RangeError('The range must have finite endpoints and positive length')
  }
  const gaps: TimeRange[] = []
  let cursor = range.start
  for (const period of mergePeriods(periods, range, false)) {
    if (period.start > cursor) gaps.push({ start: cursor, end: period.start })
    cursor = period.end
  }
  if (cursor < range.end) gaps.push({ start: cursor, end: range.end })
  return gaps
}

function checkShift(shift: WorkShift) {
  const { startMinute, endMinute } = shift
  if (![startMinute, endMinute].every(Number.isInteger) || startMinute < 0 || startMinute >= 1440
    || endMinute <= startMinute || endMinute - startMinute > 1440) {
    throw new RangeError('Invalid shift minutes')
  }
}

const zoneFormats = new Map<string, Intl.DateTimeFormat>()

function zoneFormat(timeZone: string) {
  let format = zoneFormats.get(timeZone)
  if (!format) {
    if (typeof timeZone !== 'string' || !timeZone) throw new RangeError('Invalid time zone: ' + timeZone)
    try {
      format = new Intl.DateTimeFormat('en-US', {
        timeZone, hourCycle: 'h23', era: 'short', year: 'numeric', month: 'numeric', day: 'numeric',
        hour: 'numeric', minute: 'numeric', second: 'numeric',
      })
    } catch {
      throw new RangeError('Invalid time zone: ' + timeZone)
    }
    zoneFormats.set(timeZone, format)
  }
  return format
}

/** Local wall-clock time minus UTC at an instant, in milliseconds (second resolution). */
function zoneOffset(format: Intl.DateTimeFormat, instant: number) {
  const fields: Record<string, string> = {}
  for (const part of format.formatToParts(instant)) fields[part.type] = part.value
  const year = fields.era === 'BC' ? 1 - Number(fields.year) : Number(fields.year)
  const wall = new Date(0)
  wall.setUTCFullYear(year, Number(fields.month) - 1, Number(fields.day))
  wall.setUTCHours(Number(fields.hour), Number(fields.minute), Number(fields.second), 0)
  return wall.getTime() - (instant - (((instant % 1000) + 1000) % 1000))
}

/**
 * Resolve a local wall-clock time (expressed as if it were UTC) to an instant.
 * A wall time skipped by a forward transition resolves to the transition instant.
 * A repeated wall time resolves to its earlier occurrence.
 */
function zonedInstant(format: Intl.DateTimeFormat, wall: number) {
  const before = zoneOffset(format, wall - dayMs), after = zoneOffset(format, wall + dayMs)
  // Zone rules change at most once within two days.
  if (before === after) return wall - before
  const candidates = [...new Set([before, after])].map(offset => wall - offset)
    .filter(instant => wall - zoneOffset(format, instant) === instant)
  if (candidates.length) return Math.min(...candidates)
  // Gap: the offset changes from `before` to `after` between these two instants.
  let low = Math.floor((wall - after) / 1000), high = Math.ceil((wall - before) / 1000)
  while (high - low > 1) {
    const middle = low + Math.floor((high - low) / 2)
    if (zoneOffset(format, middle * 1000) === before) low = middle
    else high = middle
  }
  return high * 1000
}

/**
 * Build epoch-millisecond periods for a weekly calendar in a fixed UTC offset or an IANA time zone.
 * With `timeZone`, shift minutes are local wall-clock times: a shift that crosses a daylight-saving
 * transition gains or loses the difference.
 */
export function buildWorkPeriods(range: TimeRange, week: WorkWeek): TimeRange[] {
  assertScheduleRange(range)
  if (week.timeZone !== undefined && week.utcOffsetMinutes !== undefined) {
    throw new Error('Specify either timeZone or utcOffsetMinutes, not both')
  }
  const format = week.timeZone === undefined ? undefined : zoneFormat(week.timeZone)
  const offset = week.utcOffsetMinutes ?? 0
  if (!Number.isInteger(offset) || Math.abs(offset) > maxUtcOffsetMinutes) {
    throw new RangeError(`utcOffsetMinutes must be an integer between -${maxUtcOffsetMinutes} and ${maxUtcOffsetMinutes}`)
  }
  const offsetMs = offset * minuteMs
  // Civil dates are handled as UTC midnights of the local calendar date.
  const localDay = (instant: number) => {
    const shift = format ? zoneOffset(format, instant) : offsetMs
    return Math.floor((instant + shift) / dayMs) * dayMs
  }
  const toInstant = (wall: number) => format ? zonedInstant(format, wall) : wall - offsetMs
  if (format && (!Number.isFinite(new Date(range.start - 2 * dayMs).getTime()) || !Number.isFinite(new Date(range.end + 2 * dayMs).getTime()))) {
    throw new RangeError('Calendar horizon must be within 3,661 civil dates')
  }
  const firstDay = localDay(range.start)
  const lastDay = localDay(range.end - 1)
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
  const push = (start: number, end: number) => {
    if (start < end) periods.push({ start, end })
  }
  for (let day = firstDay; day <= lastDay; day += dayMs) {
    const midnight = toInstant(day), nextMidnight = toInstant(day + dayMs)
    for (const shift of shiftsOn(day)) {
      push(toInstant(day + shift.startMinute * minuteMs), shift.endMinute >= 1440 ? nextMidnight : toInstant(day + shift.endMinute * minuteMs))
    }
    // An override owns its whole civil date, including any carry-in from a night shift.
    if (exceptions.has(new Date(day).toISOString().slice(0, 10))) continue
    for (const shift of shiftsOn(day - dayMs)) {
      if (shift.endMinute > 1440) push(midnight, toInstant(day + (shift.endMinute - 1440) * minuteMs))
    }
  }
  return normalizeWorkPeriods(periods, range)
}
