// Recurring events (RFC 5545 RRULE, EXDATE and RDATE): parsing and formatting of recurrence rules, expansion of a
// series into occurrences over a half-open range, override events for single occurrences, and the three edit scopes
// of a calendar ("this event", "this and following", "all events"). Pure functions in epoch milliseconds, written as
// loops; nothing here reads the runtime's clock, locale or time zone.
//
// A "wall" time is a local wall-clock time expressed as if it were UTC (see `timeZone.ts`). Rules are expanded on wall
// times in the time zone of the series, so a weekly meeting keeps its local time across daylight-saving changes. A
// wall time that does not exist (skipped by a forward change) or exists twice is resolved as RFC 5545 section 3.3.5
// says, like `fromICalendar` resolves a TZID: a skipped time takes the offset before the gap, a repeated time its first
// occurrence.
import { basicWall, checkOffset, monthLength, wallTime, weekdayCodes } from './interchangeShared.js'
import { invalidIdError, isId } from './ids.js'
import { rfc5545ZonedInstant, zoneFormat, zoneOffset } from './timeZone.js'
import type { CalendarEvent } from './eventCalendar.js'
import type { TimeRange } from './timeline.js'

const dayMs = 86_400_000
const minuteMs = 60_000
// `Intl` formats instants up to ±8.64e15 ms; wall times keep two days of margin for zone resolution.
const maxWall = 8.64e15 - 2 * dayMs
const defaultMaxOccurrences = 10_000

/** The FREQ of a recurrence rule. Sub-daily frequencies (SECONDLY, MINUTELY, HOURLY) are not supported. */
export type RecurrenceFrequency = 'daily' | 'weekly' | 'monthly' | 'yearly'

/** A BYDAY entry: a weekday (0 = Sunday to 6 = Saturday) with an optional ordinal, such as `2MO` or `-1FR`. */
export interface RecurrenceWeekday {
  weekday: number
  /** The nth weekday of the month (MONTHLY, or YEARLY with `byMonth`) or of the year; negative counts from the end. */
  ordinal?: number
}

/** A parsed RFC 5545 recurrence rule (RRULE). Every field but `frequency` is optional. */
export interface RecurrenceRule {
  frequency: RecurrenceFrequency
  /** INTERVAL: every nth day, week, month or year. Default 1. */
  interval?: number
  /** COUNT: the number of instances, the first one included. Not together with `until`. */
  count?: number
  /** UNTIL in epoch milliseconds, inclusive: the last instance starts at or before it. Not together with `count`. */
  until?: number
  /** BYDAY. Ordinals are allowed with MONTHLY and YEARLY only. */
  byWeekday?: readonly RecurrenceWeekday[]
  /** BYMONTHDAY: 1 to 31, or -1 (last day) to -31. Not with WEEKLY. */
  byMonthDay?: readonly number[]
  /** BYMONTH: 1 to 12. */
  byMonth?: readonly number[]
  /** BYSETPOS: positions (1 to 366, or negative from the end) in the instances of each period. Needs another BY part. */
  bySetPosition?: readonly number[]
  /** WKST: the first day of a week for WEEKLY periods, 0 = Sunday to 6 = Saturday. Default 1 (Monday). */
  weekStart?: number
}

/**
 * The time zone a recurrence is expanded in: an IANA `timeZone`, else a fixed `utcOffsetMinutes` (integer within
 * ±1080), else the caller's default (UTC unless documented otherwise).
 */
export interface RecurrenceZoneOptions {
  timeZone?: string
  utcOffsetMinutes?: number
}

/**
 * The recurrence of a calendar event (`CalendarEvent.recurrence`): the event's `start` and `end` are its first
 * instance (DTSTART), which is always part of the set. `rule` is a `RecurrenceRule` or RRULE text; without a rule the
 * set is the first instance and the `rdates`.
 */
export interface CalendarRecurrence extends RecurrenceZoneOptions {
  rule?: RecurrenceRule | string
  /** EXDATE: start times (epoch milliseconds) of instances to leave out. They still count towards COUNT. */
  exdates?: readonly number[]
  /** RDATE: extra start times (epoch milliseconds), with the duration of the first instance. Not counted by COUNT. */
  rdates?: readonly number[]
}

/** A recurring series for `expandRecurrence`: an ID, the first instance and its recurrence. */
export interface RecurrenceSeries extends CalendarRecurrence, TimeRange {
  id: string
}

/** One instance of a series. */
export interface RecurrenceOccurrence extends TimeRange {
  /** `<seriesId>:<recurrenceId>`, stable while the series keeps its start. */
  id: string
  seriesId: string
  /** The start the rule gives this instance (RECURRENCE-ID), in epoch milliseconds; it identifies the instance. */
  recurrenceId: number
}

/** Options of `expandRecurrence` and `expandRecurringEvents`. */
export interface RecurrenceExpandOptions {
  /** IANA time zone of a series that has neither `timeZone` nor `utcOffsetMinutes`. Default `UTC`. */
  timeZone?: string
  /**
   * The most instances one series may produce up to the end of the range (instances before the range count too when
   * the rule has COUNT, because they must be counted). Default 10,000; more throws a RangeError.
   */
  maxOccurrences?: number
}

/** Which instances a recurring edit changes: the one occurrence, it and all later ones, or the whole series. */
export type RecurringEditScope = 'occurrence' | 'following' | 'series'

/** The occurrence an edit is about, as EventCalendar reports it in `EventCalendarEdit.occurrence`. */
export interface RecurringEditTarget {
  seriesId: string
  recurrenceId: number
}

/** The new interval (and optionally resource) of the edited occurrence. */
export interface RecurringEditChange extends TimeRange {
  resourceId?: string
}

/** Options of `applyRecurringEdit`. */
export interface RecurringEditOptions {
  /** Time zone of a series without its own zone, as in `RecurrenceExpandOptions`. Default `UTC`. */
  timeZone?: string
  /** ID of the new series that `following` creates. Default `<seriesId>:<recurrenceId>`. */
  newSeriesId?: string
}

// Calendar arithmetic on wall times ----------------------------------------------------------------------------------

const frequencies: readonly RecurrenceFrequency[] = ['daily', 'weekly', 'monthly', 'yearly']
/** Days, weeks, months and years of the 400-year Gregorian cycle, after which every calendar pattern repeats. */
const cycleUnits: Record<RecurrenceFrequency, number> = { daily: 146_097, weekly: 20_871, monthly: 4_800, yearly: 400 }

const floorDay = (wall: number) => Math.floor(wall / dayMs) * dayMs

function dateWall(year: number, monthIndex: number, day: number) {
  const date = new Date(0)
  date.setUTCFullYear(year, monthIndex, day)
  return date.getTime()
}

function fieldsOf(wall: number) {
  const date = new Date(wall)
  return { year: date.getUTCFullYear(), month: date.getUTCMonth(), day: date.getUTCDate(), weekday: date.getUTCDay() }
}

interface Clock {
  wall(instant: number): number
  instant(wall: number): number
}

function clockOf(zone: RecurrenceZoneOptions, fallbackZone?: string): Clock {
  const timeZone = zone.timeZone ?? (zone.utcOffsetMinutes === undefined ? fallbackZone : undefined)
  if (timeZone !== undefined && timeZone !== 'UTC') {
    const format = zoneFormat(timeZone)
    return { wall: instant => instant + zoneOffset(format, instant), instant: wall => rfc5545ZonedInstant(format, wall) }
  }
  if (timeZone !== undefined) zoneFormat(timeZone)
  const offset = timeZone === undefined ? checkOffset(zone.utcOffsetMinutes) * minuteMs : 0
  return { wall: instant => instant + offset, instant: wall => wall - offset }
}

// Rules --------------------------------------------------------------------------------------------------------------

function checkInteger(value: unknown, what: string, low: number, high: number, nonzero = false) {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < low || value > high || (nonzero && value === 0)) {
    throw new RangeError(`${what} must be an integer from ${low} to ${high}${nonzero ? ', not 0' : ''}: ${String(value)}`)
  }
  return value
}

function list<T>(value: readonly T[] | undefined, what: string): readonly T[] | undefined {
  if (value === undefined) return undefined
  if (!Array.isArray(value)) throw new RangeError(what + ' must be an array')
  return value.length ? value : undefined
}

/** Check a rule and return a copy without empty lists. Throws Error for invalid combinations and RangeError for numbers. */
function normalizeRule(rule: RecurrenceRule): RecurrenceRule {
  if (rule === null || typeof rule !== 'object') throw new Error('A recurrence rule must be an object or RRULE text')
  if (!frequencies.includes(rule.frequency)) throw new Error('Unknown recurrence frequency: ' + String(rule.frequency))
  const result: RecurrenceRule = { frequency: rule.frequency }
  if (rule.interval !== undefined) result.interval = checkInteger(rule.interval, 'INTERVAL', 1, 1_000_000)
  if (rule.count !== undefined) result.count = checkInteger(rule.count, 'COUNT', 1, Number.MAX_SAFE_INTEGER)
  if (rule.until !== undefined) {
    if (typeof rule.until !== 'number' || !Number.isFinite(rule.until)) throw new RangeError('UNTIL must be a finite time')
    if (rule.count !== undefined) throw new Error('A recurrence rule cannot have both COUNT and UNTIL')
    result.until = rule.until
  }
  const byWeekday = list(rule.byWeekday, 'BYDAY')
  if (byWeekday) {
    result.byWeekday = byWeekday.map(entry => {
      if (entry === null || typeof entry !== 'object') throw new RangeError('A BYDAY entry must be an object with a weekday')
      const weekday = checkInteger(entry.weekday, 'A BYDAY weekday', 0, 6)
      if (entry.ordinal === undefined) return { weekday }
      if (rule.frequency !== 'monthly' && rule.frequency !== 'yearly') {
        throw new Error('A BYDAY ordinal such as 2MO needs FREQ=MONTHLY or FREQ=YEARLY')
      }
      return { weekday, ordinal: checkInteger(entry.ordinal, 'A BYDAY ordinal', -53, 53, true) }
    })
  }
  const byMonthDay = list(rule.byMonthDay, 'BYMONTHDAY')
  if (byMonthDay) {
    if (rule.frequency === 'weekly') throw new Error('BYMONTHDAY cannot be used with FREQ=WEEKLY')
    result.byMonthDay = byMonthDay.map(day => checkInteger(day, 'BYMONTHDAY', -31, 31, true))
  }
  const byMonth = list(rule.byMonth, 'BYMONTH')
  if (byMonth) result.byMonth = byMonth.map(month => checkInteger(month, 'BYMONTH', 1, 12))
  const bySetPosition = list(rule.bySetPosition, 'BYSETPOS')
  if (bySetPosition) {
    if (!result.byWeekday && !result.byMonthDay && !result.byMonth) throw new Error('BYSETPOS needs BYDAY, BYMONTHDAY or BYMONTH')
    result.bySetPosition = bySetPosition.map(position => checkInteger(position, 'BYSETPOS', -366, 366, true))
  }
  if (rule.weekStart !== undefined) result.weekStart = checkInteger(rule.weekStart, 'WKST', 0, 6)
  return result
}

const unsupportedParts = new Set(['BYSECOND', 'BYMINUTE', 'BYHOUR', 'BYYEARDAY', 'BYWEEKNO', 'RSCALE', 'SKIP'])
const ruleTime = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/

function parseInteger(value: string, what: string) {
  if (!/^[+-]?\d+$/.test(value)) throw new RangeError(`${what} must be an integer: ${value}`)
  return Number(value)
}

function parseList(value: string, what: string) {
  if (value === '') throw new RangeError(what + ' must not be empty')
  return value.split(',').map(part => part.trim())
}

/**
 * Parse RFC 5545 RRULE text, with or without the `RRULE:` prefix, into a `RecurrenceRule`. Part names are
 * case-insensitive. Supported: FREQ (DAILY, WEEKLY, MONTHLY, YEARLY), INTERVAL, COUNT, UNTIL, BYDAY (with ordinals
 * such as `2MO` and `-1FR` for MONTHLY and YEARLY), BYMONTHDAY (also negative), BYMONTH, BYSETPOS and WKST.
 *
 * UNTIL may be UTC (`20261231T235959Z`), a floating date-time or a date; a floating date-time is read in `options`
 * (an IANA `timeZone` or `utcOffsetMinutes`, default UTC), and a date includes the whole local day (it becomes one
 * millisecond before the next local midnight).
 *
 * Throws an Error for text that is not a rule, a missing FREQ, a repeated or unknown part, the unsupported FREQ values
 * SECONDLY, MINUTELY and HOURLY, the unsupported parts BYSECOND, BYMINUTE, BYHOUR, BYYEARDAY, BYWEEKNO, RSCALE and
 * SKIP, and invalid combinations (COUNT with UNTIL, BYDAY ordinals outside MONTHLY and YEARLY, BYMONTHDAY with WEEKLY,
 * BYSETPOS alone); a RangeError for numbers out of range.
 */
export function parseRecurrenceRule(text: string, options: RecurrenceZoneOptions = {}): RecurrenceRule {
  if (typeof text !== 'string') throw new Error('A recurrence rule must be a string')
  let body = text.trim()
  if (/^RRULE:/i.test(body)) body = body.slice(6)
  if (body === '') throw new Error('A recurrence rule must not be empty')
  const parts = new Map<string, string>()
  for (const part of body.split(';')) {
    if (part.trim() === '') continue
    const equals = part.indexOf('=')
    if (equals <= 0) throw new Error('Invalid recurrence rule part: ' + part)
    const name = part.slice(0, equals).trim().toUpperCase()
    if (parts.has(name)) throw new Error('Repeated recurrence rule part: ' + name)
    parts.set(name, part.slice(equals + 1).trim())
  }
  const rule: { -readonly [K in keyof RecurrenceRule]: RecurrenceRule[K] } = { frequency: 'daily' }
  const frequency = parts.get('FREQ')
  if (frequency === undefined) throw new Error('A recurrence rule needs FREQ')
  const upper = frequency.toUpperCase()
  if (upper === 'SECONDLY' || upper === 'MINUTELY' || upper === 'HOURLY') throw new Error('Unsupported recurrence frequency: ' + upper)
  if (!frequencies.includes(upper.toLowerCase() as RecurrenceFrequency)) throw new Error('Unknown recurrence frequency: ' + frequency)
  rule.frequency = upper.toLowerCase() as RecurrenceFrequency
  for (const [name, value] of parts) {
    switch (name) {
      case 'FREQ':
        break
      case 'INTERVAL':
        rule.interval = parseInteger(value, 'INTERVAL')
        break
      case 'COUNT':
        rule.count = parseInteger(value, 'COUNT')
        break
      case 'UNTIL': {
        const match = ruleTime.exec(value)
        const [y, mo, d, h = 0, mi = 0, s = 0] = (match?.slice(1, 7) ?? []).map(field => field === undefined ? undefined : Number(field)) as number[]
        const wall = match ? wallTime(y!, mo!, d!, h, mi, s) : undefined
        if (wall === undefined) throw new RangeError('UNTIL must be a date or date-time such as 20261231T235959Z: ' + value)
        if (match![7] === 'Z') rule.until = wall
        else {
          const clock = clockOf(options)
          rule.until = match![4] === undefined ? clock.instant(wall + dayMs) - 1 : clock.instant(wall)
        }
        break
      }
      case 'BYDAY':
        rule.byWeekday = parseList(value, 'BYDAY').map(entry => {
          const match = /^([+-]?\d{1,2})?([A-Za-z]{2})$/.exec(entry)
          const weekday = match ? weekdayCodes.indexOf(match[2]!.toUpperCase() as typeof weekdayCodes[number]) : -1
          if (!match || weekday < 0) throw new RangeError('Invalid BYDAY entry: ' + entry)
          return match[1] === undefined ? { weekday } : { weekday, ordinal: Number(match[1]) }
        })
        break
      case 'BYMONTHDAY':
        rule.byMonthDay = parseList(value, 'BYMONTHDAY').map(day => parseInteger(day, 'BYMONTHDAY'))
        break
      case 'BYMONTH':
        rule.byMonth = parseList(value, 'BYMONTH').map(month => parseInteger(month, 'BYMONTH'))
        break
      case 'BYSETPOS':
        rule.bySetPosition = parseList(value, 'BYSETPOS').map(position => parseInteger(position, 'BYSETPOS'))
        break
      case 'WKST': {
        const weekday = weekdayCodes.indexOf(value.toUpperCase() as typeof weekdayCodes[number])
        if (weekday < 0) throw new RangeError('Invalid WKST: ' + value)
        rule.weekStart = weekday
        break
      }
      default:
        throw new Error(`${unsupportedParts.has(name) ? 'Unsupported' : 'Unknown'} recurrence rule part: ${name}`)
    }
  }
  return normalizeRule(rule)
}

/**
 * Write a `RecurrenceRule` as RRULE text without the `RRULE:` prefix, in the order FREQ, COUNT or UNTIL, INTERVAL,
 * BYMONTH, BYMONTHDAY, BYDAY, BYSETPOS and WKST. UNTIL is written in UTC (`20261231T235959Z`, whole seconds rounded
 * down), or with `allDay` as the local date of `until` in `options` (default UTC). Throws like `parseRecurrenceRule`
 * for an invalid rule.
 */
export function formatRecurrenceRule(rule: RecurrenceRule, options: RecurrenceZoneOptions & { allDay?: boolean } = {}): string {
  const checked = normalizeRule(rule)
  const parts = ['FREQ=' + checked.frequency.toUpperCase()]
  if (checked.count !== undefined) parts.push('COUNT=' + checked.count)
  if (checked.until !== undefined) {
    parts.push('UNTIL=' + (options.allDay
      ? basicWall(clockOf(options).wall(checked.until)).slice(0, 8)
      : basicWall(Math.floor(checked.until / 1000) * 1000) + 'Z'))
  }
  if (checked.interval !== undefined) parts.push('INTERVAL=' + checked.interval)
  if (checked.byMonth) parts.push('BYMONTH=' + checked.byMonth.join(','))
  if (checked.byMonthDay) parts.push('BYMONTHDAY=' + checked.byMonthDay.join(','))
  if (checked.byWeekday) parts.push('BYDAY=' + checked.byWeekday.map(entry => (entry.ordinal ?? '') + weekdayCodes[entry.weekday]!).join(','))
  if (checked.bySetPosition) parts.push('BYSETPOS=' + checked.bySetPosition.join(','))
  if (checked.weekStart !== undefined) parts.push('WKST=' + weekdayCodes[checked.weekStart])
  return parts.join(';')
}

// Expansion ----------------------------------------------------------------------------------------------------------

function matchesWeekday(entries: readonly RecurrenceWeekday[], wall: number, yearScope: boolean) {
  const date = fieldsOf(wall)
  let nth = 0, back = 0
  for (const entry of entries) {
    if (entry.weekday !== date.weekday) continue
    if (entry.ordinal === undefined) return true
    if (!nth) {
      let index: number, length: number
      if (yearScope) {
        const first = dateWall(date.year, 0, 1)
        index = (wall - first) / dayMs + 1
        length = (dateWall(date.year + 1, 0, 1) - first) / dayMs
      } else {
        index = date.day
        length = monthLength(date.year, date.month)
      }
      nth = Math.ceil(index / 7)
      back = -Math.ceil((length - index + 1) / 7)
    }
    if (entry.ordinal === nth || entry.ordinal === back) return true
  }
  return false
}

function monthDays(year: number, month: number, byMonthDay: readonly number[]) {
  const length = monthLength(year, month)
  const days = new Set<number>()
  for (const value of byMonthDay) {
    const day = value > 0 ? value : length + 1 + value
    if (day >= 1 && day <= length) days.add(dateWall(year, month, day))
  }
  return [...days].sort((a, b) => a - b)
}

function allDays(from: number, to: number) {
  const days: number[] = []
  for (let wall = from; wall < to; wall += dayMs) days.push(wall)
  return days
}

/** The wall midnights of the instances of one period, before BYSETPOS and the DTSTART filter, ascending. */
function periodDays(rule: RecurrenceRule, periodStart: number, first: ReturnType<typeof fieldsOf>): number[] {
  const { byWeekday, byMonthDay, byMonth } = rule
  const inMonths = (wall: number) => !byMonth || byMonth.includes(fieldsOf(wall).month + 1)
  if (rule.frequency === 'daily') {
    const date = fieldsOf(periodStart)
    if (!inMonths(periodStart)) return []
    if (byMonthDay && !monthDays(date.year, date.month, byMonthDay).includes(periodStart)) return []
    if (byWeekday && !byWeekday.some(entry => entry.weekday === date.weekday)) return []
    return [periodStart]
  }
  if (rule.frequency === 'weekly') {
    const days: number[] = []
    for (let offset = 0; offset < 7; offset++) {
      const wall = periodStart + offset * dayMs
      const weekday = fieldsOf(wall).weekday
      if ((byWeekday ? byWeekday.some(entry => entry.weekday === weekday) : weekday === first.weekday) && inMonths(wall)) days.push(wall)
    }
    return days
  }
  const { year, month } = fieldsOf(periodStart)
  let days: number[]
  if (rule.frequency === 'monthly') {
    if (!inMonths(periodStart)) return []
    if (byMonthDay) days = monthDays(year, month, byMonthDay)
    else if (byWeekday) days = allDays(periodStart, dateWall(year, month + 1, 1))
    else days = first.day <= monthLength(year, month) ? [dateWall(year, month, first.day)] : []
    return byWeekday ? days.filter(wall => matchesWeekday(byWeekday, wall, false)) : days
  }
  const months = byMonth ? [...new Set(byMonth)].sort((a, b) => a - b).map(value => value - 1) : byMonthDay ? [...Array(12).keys()] : [first.month]
  if (byMonthDay) days = months.flatMap(value => monthDays(year, value, byMonthDay))
  else if (byWeekday) {
    days = byMonth ? months.flatMap(value => allDays(dateWall(year, value, 1), dateWall(year, value + 1, 1))) : allDays(periodStart, dateWall(year + 1, 0, 1))
  } else days = months.flatMap(value => first.day <= monthLength(year, value) ? [dateWall(year, value, first.day)] : [])
  return byWeekday ? days.filter(wall => matchesWeekday(byWeekday, wall, !byMonth)) : days
}

/** The most days a period of each frequency can hold, for BYSETPOS positions that no period reaches. */
const periodSize: Record<RecurrenceFrequency, number> = { daily: 1, weekly: 7, monthly: 31, yearly: 366 }

/**
 * Whether a rule can never give an instance after DTSTART, checked up front so that it is not walked for a whole
 * Gregorian cycle: month days that none of the allowed months has (BYMONTH=2;BYMONTHDAY=30, or the DTSTART day 31 of a
 * MONTHLY or YEARLY rule limited to short months), BYDAY ordinals beyond the fifth weekday of a month, or BYSETPOS
 * positions beyond the size of every period.
 */
function neverMatches(rule: RecurrenceRule, firstDay: number) {
  const { byWeekday, byMonthDay, byMonth, bySetPosition, frequency } = rule
  const monthly = frequency === 'monthly' || (frequency === 'yearly' && byMonth !== undefined)
  const days = byMonthDay ?? (frequency !== 'daily' && frequency !== 'weekly' && !byWeekday ? [firstDay] : undefined)
  if (days) {
    // Month lengths of a leap year, in which every month day that exists at all occurs.
    const months = byMonth ?? (frequency === 'yearly' && !byMonthDay ? [] : [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])
    if (months.length && !months.some(month => days.some(day => Math.abs(day) <= monthLength(2000, month - 1)))) return true
  }
  if (monthly && byWeekday && byWeekday.every(entry => entry.ordinal !== undefined && Math.abs(entry.ordinal) > 5)) return true
  return bySetPosition !== undefined && bySetPosition.every(position => Math.abs(position) > periodSize[frequency])
}

/**
 * The wall start times of a rule, ascending: DTSTART first, then every instance after it. With `jumpWall` (only
 * without COUNT), periods that end before it are skipped. A rule that can never match (see `neverMatches`) yields only
 * DTSTART; as a safeguard the walk also stops after a whole Gregorian cycle of periods without a candidate, and at the
 * end of the supported time range.
 */
function* ruleWalls(rule: RecurrenceRule, startWall: number, jumpWall?: number): Generator<number> {
  const startDay = floorDay(startWall)
  const timeOfDay = startWall - startDay
  const first = fieldsOf(startDay)
  const interval = rule.interval ?? 1
  const weekStart = rule.weekStart ?? 1
  const firstWeek = startDay - ((first.weekday - weekStart + 7) % 7) * dayMs
  const periodStart = (units: number) => {
    switch (rule.frequency) {
      case 'daily': return startDay + units * dayMs
      case 'weekly': return firstWeek + units * 7 * dayMs
      case 'monthly': return dateWall(first.year, first.month + units, 1)
      default: return dateWall(first.year + units, 0, 1)
    }
  }
  let index = 0
  if (jumpWall !== undefined && jumpWall > startWall) {
    const target = fieldsOf(floorDay(jumpWall))
    const units = rule.frequency === 'daily' ? (floorDay(jumpWall) - startDay) / dayMs
      : rule.frequency === 'weekly' ? Math.floor((floorDay(jumpWall) - firstWeek) / (7 * dayMs))
        : rule.frequency === 'monthly' ? (target.year - first.year) * 12 + target.month - first.month
          : target.year - first.year
    index = Math.max(0, Math.floor(units / interval))
  }
  if (index === 0) yield startWall
  if (neverMatches(rule, first.day)) return
  let empty = 0
  for (;; index++) {
    const from = periodStart(index * interval)
    if (!Number.isFinite(from) || from > maxWall) return
    let days = periodDays(rule, from, first)
    if (rule.bySetPosition && days.length) {
      const picked = new Set<number>()
      for (const position of rule.bySetPosition) {
        const at = position > 0 ? position - 1 : days.length + position
        if (at >= 0 && at < days.length) picked.add(days[at]!)
      }
      days = [...picked].sort((a, b) => a - b)
    }
    if (days.length) empty = 0
    else if (++empty > cycleUnits[rule.frequency]) return
    for (const day of days) {
      const wall = day + timeOfDay
      if (wall > maxWall) return
      if (wall > startWall) yield wall
    }
  }
}

interface PreparedSeries {
  id: string
  start: number
  clock: Clock
  rule?: RecurrenceRule
  startWall: number
  durationWall: number
  exdates: Set<number>
  rdates: number[]
}

function checkFinite(value: unknown, what: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || Math.abs(value) > 8.64e15) throw new RangeError(what + ' must be a finite time')
  return value
}

function times(values: readonly number[] | undefined, what: string) {
  if (values === undefined) return []
  if (!Array.isArray(values)) throw new RangeError(what + ' must be an array')
  return values.map(value => checkFinite(value, what))
}

function prepare(series: RecurrenceSeries, fallbackZone: string | undefined): PreparedSeries {
  if (series === null || typeof series !== 'object') throw new Error('A recurring series must be an object')
  if (!isId(series.id)) throw invalidIdError('event', series.id)
  const start = checkFinite(series.start, `The start of event ${series.id}`), end = checkFinite(series.end, `The end of event ${series.id}`)
  if (end < start) throw new RangeError(`Event ${series.id} must have finite start <= end`)
  const zone = { timeZone: series.timeZone, utcOffsetMinutes: series.utcOffsetMinutes }
  const clock = clockOf(zone, fallbackZone)
  const parseZone = series.timeZone === undefined && series.utcOffsetMinutes === undefined ? { timeZone: fallbackZone } : zone
  const rule = series.rule === undefined ? undefined
    : typeof series.rule === 'string' ? parseRecurrenceRule(series.rule, parseZone) : normalizeRule(series.rule)
  const startWall = clock.wall(start)
  return {
    id: series.id, start, clock, rule, startWall, durationWall: clock.wall(end) - startWall,
    exdates: new Set(times(series.exdates, 'exdates')), rdates: [...new Set(times(series.rdates, 'rdates'))].sort((a, b) => a - b),
  }
}

/** Internal (not exported from index.ts): check an expansion range, as `expandRecurrence` does. */
export function checkRange(range: TimeRange) {
  checkFinite(range?.start, 'range.start')
  checkFinite(range.end, 'range.end')
  if (range.end <= range.start) throw new RangeError('range.end must be after range.start')
}

/** Internal (not exported from index.ts): check `maxOccurrences` and return it or the default. */
export function checkMax(value: number | undefined) {
  return value === undefined ? defaultMaxOccurrences : checkInteger(value, 'maxOccurrences', 1, Number.MAX_SAFE_INTEGER)
}

const tooMany = (id: string, max: number) => new RangeError(`The recurrence of event ${id} has more than ${max} occurrences (maxOccurrences)`)

/**
 * Visit the rule instances of a prepared series in order (start instant and wall time) until `visit` returns false,
 * applying COUNT and UNTIL but not EXDATE. Without a rule, the only instance is the first one.
 */
function visitRule(series: PreparedSeries, visit: (start: number, wall: number) => boolean, jumpTo?: number) {
  const rule = series.rule
  if (!rule) {
    visit(series.start, series.startWall)
    return
  }
  const jump = rule.count === undefined && jumpTo !== undefined ? jumpTo : undefined
  let count = 0
  for (const wall of ruleWalls(rule, series.startWall, jump)) {
    if (rule.count !== undefined && count >= rule.count) return
    count++
    const start = wall === series.startWall ? series.start : series.clock.instant(wall)
    if (rule.until !== undefined && start > rule.until) return
    if (!visit(start, wall)) return
  }
}

function expandPrepared(series: PreparedSeries, range: TimeRange, max: number): RecurrenceOccurrence[] {
  const result: RecurrenceOccurrence[] = []
  const seen = new Set<number>()
  const add = (start: number, wall: number) => {
    seen.add(start)
    const end = series.durationWall === 0 ? start : series.clock.instant(wall + series.durationWall)
    const inside = end > start ? end > range.start && start < range.end : start >= range.start && start < range.end
    if (inside) result.push({ id: `${series.id}:${start}`, seriesId: series.id, recurrenceId: start, start, end })
    return inside
  }
  // Instances in the range count towards `max`, and with COUNT also the ones before it, which had to be walked.
  const counted = series.rule?.count !== undefined
  let produced = 0
  visitRule(series, (start, wall) => {
    if (start >= range.end) return false
    const inside = series.exdates.has(start) ? false : add(start, wall)
    if ((inside || counted) && ++produced > max) throw tooMany(series.id, max)
    return true
  }, series.clock.wall(range.start) - Math.max(0, series.durationWall) - 2 * dayMs)
  for (const start of series.rdates) {
    if (start >= range.end) break
    if (seen.has(start) || series.exdates.has(start)) continue
    if (add(start, series.clock.wall(start)) && ++produced > max) throw tooMany(series.id, max)
  }
  return result.sort((a, b) => a.start - b.start || a.recurrenceId - b.recurrenceId)
}

/**
 * The occurrences of a recurring series that overlap the half-open `range` (a zero-duration occurrence when its start
 * is inside it), sorted by start. The first instance (`start`, `end`) is always part of the set; the rule adds the
 * later ones, RDATEs add extra starts and EXDATEs remove starts (matched exactly, in epoch milliseconds).
 *
 * The rule is expanded on local wall-clock times of the series zone: `series.timeZone` (IANA), else
 * `series.utcOffsetMinutes`, else `options.timeZone`, else UTC. Each occurrence starts at the local time of day of the
 * first instance and keeps its local duration, so a weekly 09:00–10:00 meeting stays 09:00–10:00 local time across a
 * daylight-saving change; all-day events (local midnights) keep their number of days. A local time skipped by a
 * daylight-saving gap takes the UTC offset before the gap, and a repeated one its first occurrence (RFC 5545 section
 * 3.3.5). Dates that do not exist, such as February 30 or the 31st of a short month, are skipped and not counted.
 *
 * Each occurrence has `id` `<series id>:<recurrenceId>`, `seriesId` and `recurrenceId`, its start before any change.
 * Throws a RangeError when the series produces more than `maxOccurrences` (default 10,000) instances up to the end of
 * the range, and the Errors of `parseRecurrenceRule` for an invalid rule. A rule that never matches (such as
 * `FREQ=YEARLY;BYMONTH=2;BYMONTHDAY=30`) yields only the first instance.
 */
export function expandRecurrence(series: RecurrenceSeries, range: TimeRange, options: RecurrenceExpandOptions = {}): RecurrenceOccurrence[] {
  checkRange(range)
  const max = checkMax(options.maxOccurrences)
  return expandPrepared(prepare(series, options.timeZone), range, max)
}

const overrideKey = (seriesId: string, recurrenceId: number) => seriesId + '\u0000' + recurrenceId

function withoutRecurrence<E extends ExpandableEvent>(event: E): E {
  const { recurrence: _recurrence, ...rest } = event
  return rest as E
}

function seriesOf(event: ExpandableEvent): RecurrenceSeries {
  return { id: event.id, start: event.start, end: event.end, ...event.recurrence }
}

/**
 * Replace the recurring events (those with `recurrence`) by their occurrences that overlap `range`, ready for
 * EventCalendar. Each occurrence copies the event without `recurrence`, with `id` `<event id>:<recurrenceId>`, its
 * `start` and `end`, `seriesId` (the event ID) and `recurrenceId`. Occurrences take the place of their series, in
 * order of start.
 *
 * An event without `recurrence` but with `seriesId` and `recurrenceId` is an override: a changed occurrence, which
 * replaces the generated occurrence with the same `seriesId` and `recurrenceId`. Overrides and other events are
 * returned as they are, whether or not they overlap the range. `applyRecurringEdit` creates overrides.
 *
 * `options.timeZone` is the zone of series without their own (pass the calendar's `timeZone`). Throws the errors of
 * `expandRecurrence`. The input is not modified.
 */
export function expandRecurringEvents<E extends CalendarEvent>(events: readonly E[], range: TimeRange, options: RecurrenceExpandOptions = {}): E[] {
  if (!Array.isArray(events as unknown)) throw new RangeError('events must be an array')
  checkRange(range)
  return expandEventList(events, range, checkMax(options.maxOccurrences), options.timeZone)
}

/** The fields of an event that `expandEventList` reads: a series has `recurrence`, an override `seriesId` and `recurrenceId`. */
export interface ExpandableEvent extends TimeRange {
  id: string
  recurrence?: CalendarRecurrence
  seriesId?: string
  recurrenceId?: number
}

/**
 * Internal (not exported from index.ts), shared by `expandRecurringEvents` and `fromICalendar`: replace each series by
 * its occurrences in a checked `range`, leaving out the ones an override replaces, and keep the other events.
 */
export function expandEventList<E extends ExpandableEvent>(events: readonly E[], range: TimeRange, max: number, fallbackZone?: string): E[] {
  const overridden = new Set<string>()
  for (const event of events) {
    if (event && event.recurrence === undefined && event.seriesId !== undefined && event.recurrenceId !== undefined) {
      overridden.add(overrideKey(event.seriesId, event.recurrenceId))
    }
  }
  const result: E[] = []
  for (const event of events) {
    if (!event || event.recurrence === undefined) {
      result.push(event)
      continue
    }
    const base = withoutRecurrence(event)
    for (const occurrence of expandPrepared(prepare(seriesOf(event), fallbackZone), range, max)) {
      if (overridden.has(overrideKey(event.id, occurrence.recurrenceId))) continue
      result.push({ ...base, id: occurrence.id, start: occurrence.start, end: occurrence.end, seriesId: event.id, recurrenceId: occurrence.recurrenceId })
    }
  }
  return result
}

// Editing ------------------------------------------------------------------------------------------------------------

const scopes: readonly RecurringEditScope[] = ['occurrence', 'following', 'series']

/**
 * A rule moved by whole local days: weekdays of BYDAY, and BYMONTHDAY days. Throws an Error when a move to another day
 * would change what the rule means: BYDAY ordinals (2MO is not the day before 2TU), BYSETPOS (positions pick other
 * days), BYMONTHDAY days outside 1–28 (or −28 to −1) before or after the move (not every month has them), and BYMONTH
 * when the edited occurrence moves to another month.
 */
function shiftRule(rule: RecurrenceRule, days: number, monthChanges: boolean, shiftTime: (time: number) => number, seriesId: string): RecurrenceRule {
  const result: RecurrenceRule = { ...rule }
  if (days) {
    const reason = rule.byWeekday?.some(entry => entry.ordinal !== undefined) ? 'BYDAY ordinals such as 2MO'
      : rule.bySetPosition ? 'BYSETPOS'
        : rule.byMonthDay?.some(day => Math.abs(day) > 28 || Math.sign(day + days) !== Math.sign(day) || Math.abs(day + days) > 28) ? 'BYMONTHDAY days that not every month has'
          : rule.byMonth && monthChanges ? 'BYMONTH, and the occurrence moves to another month' : undefined
    if (reason) {
      throw new Error(`Event ${seriesId} cannot move to another day: its recurrence rule has ${reason}, whose meaning would change; change the rule instead`)
    }
    if (rule.byWeekday) result.byWeekday = rule.byWeekday.map(entry => ({ ...entry, weekday: (((entry.weekday + days) % 7) + 7) % 7 }))
    if (rule.byMonthDay) result.byMonthDay = rule.byMonthDay.map(day => day + days)
  }
  if (rule.until !== undefined) result.until = shiftTime(rule.until)
  return result
}

/** The rule in the form the event had it: an object, or RRULE text when it was text. */
function ruleAsGiven(original: RecurrenceRule | string, rule: RecurrenceRule, event: CalendarEvent, zone: RecurrenceZoneOptions) {
  return typeof original === 'string' ? formatRecurrenceRule(rule, { ...zone, allDay: event.allDay }) : rule
}

/** The checked input of `applyRecurringEdit`, shared by the functions of the three scopes. */
interface EditContext<E extends CalendarEvent> {
  events: readonly E[]
  series: E
  recurrence: CalendarRecurrence
  prepared: PreparedSeries
  recurrenceId: number
  /** The zone of the series as given, or the fallback zone, for writing a rule given as text. */
  zone: RecurrenceZoneOptions
  change: RecurringEditChange | 'delete'
}

/** How `series` and `following` move later instances: by the move of the edited occurrence in local wall-clock time. */
interface EditMove {
  shift(time: number): number
  /** The end of an instance that starts at `start`, with the new local duration. */
  endOf(start: number): number
  rule(rule: RecurrenceRule): RecurrenceRule
}

function isOverrideOf(event: CalendarEvent | undefined, seriesId: string, at?: number) {
  return !!event && event.recurrence === undefined && event.seriesId === seriesId && event.recurrenceId !== undefined
    && (at === undefined || event.recurrenceId === at)
}

function withResource<E extends CalendarEvent>(context: EditContext<E>, event: E): E {
  const { change } = context
  return change !== 'delete' && change.resourceId !== undefined ? { ...event, resourceId: change.resourceId } : event
}

function withoutRule(recurrence: CalendarRecurrence): CalendarRecurrence {
  const { rule: _rule, ...rest } = recurrence
  return rest
}

function moveOf<E extends CalendarEvent>(context: EditContext<E>): EditMove {
  const { prepared: { clock }, change, recurrenceId, series } = context
  const fromWall = clock.wall(recurrenceId)
  const deltaWall = change === 'delete' ? 0 : clock.wall(change.start) - fromWall
  const toWall = fromWall + deltaWall
  const deltaDays = Math.round((floorDay(toWall) - floorDay(fromWall)) / dayMs)
  const monthChanges = fieldsOf(fromWall).month !== fieldsOf(toWall).month
  const shift = (time: number) => deltaWall === 0 ? time : clock.instant(clock.wall(time) + deltaWall)
  const durationWall = change === 'delete' ? context.prepared.durationWall : clock.wall(change.end) - clock.wall(change.start)
  return {
    shift,
    endOf: start => durationWall === 0 ? start : clock.instant(clock.wall(start) + durationWall),
    rule: rule => shiftRule(rule, deltaDays, monthChanges, shift, series.id),
  }
}

/** `occurrence`: add or update the override of the occurrence, or leave it out with an EXDATE. */
function editOccurrence<E extends CalendarEvent>(context: EditContext<E>): E[] {
  const { events, series, recurrence, prepared, recurrenceId, change } = context
  if (change === 'delete') {
    const exdates = [...new Set([...prepared.exdates, recurrenceId])].sort((a, b) => a - b)
    return events.filter(event => !isOverrideOf(event, series.id, recurrenceId))
      .map(event => event === series ? { ...series, recurrence: { ...recurrence, exdates } } : event)
  }
  const existing = events.findIndex(event => isOverrideOf(event, series.id, recurrenceId))
  if (existing >= 0) return events.map((event, at) => at === existing ? withResource(context, { ...event, start: change.start, end: change.end }) : event)
  const id = `${series.id}:${recurrenceId}`
  if (events.some(event => event?.id === id)) throw new Error('Duplicate event ID: ' + id)
  return [...events, withResource(context, { ...withoutRecurrence(series), id, start: change.start, end: change.end, seriesId: series.id, recurrenceId })]
}

/** `series` (or `following` from the first instance): move the whole series, or delete it with its overrides. */
function editSeries<E extends CalendarEvent>(context: EditContext<E>): E[] {
  const { events, series, recurrence, prepared, recurrenceId, zone, change } = context
  if (change === 'delete') return events.filter(event => event !== series && !isOverrideOf(event, series.id))
  const move = moveOf(context)
  const start = move.shift(series.start)
  const rule = prepared.rule && move.rule(prepared.rule)
  const next: E = withResource(context, {
    ...series, start, end: move.endOf(start),
    recurrence: {
      ...recurrence,
      ...(rule ? { rule: ruleAsGiven(recurrence.rule!, rule, series, zone) } : {}),
      ...(recurrence.exdates ? { exdates: [...prepared.exdates].map(move.shift) } : {}),
      ...(recurrence.rdates ? { rdates: prepared.rdates.map(move.shift) } : {}),
    },
  })
  return events.filter(event => !isOverrideOf(event, series.id, recurrenceId))
    .map(event => event === series ? next : isOverrideOf(event, series.id) ? { ...event, recurrenceId: move.shift(event.recurrenceId!) } : event)
}

/**
 * `following` after the first instance: end the series before the occurrence and, for a change, start a new series
 * with the rest. When the occurrence is an RDATE between rule instances, the new series starts at the next rule instance
 * (so its rule keeps the pattern of the original) and the changed occurrence becomes one of its RDATEs.
 */
function editFollowing<E extends CalendarEvent>(context: EditContext<E>, options: RecurringEditOptions): E[] {
  const { events, series, recurrence, prepared, recurrenceId, zone, change } = context
  // Count the rule instances before the occurrence (for COUNT), and find whether it is one, or else the next one.
  let before = 0, ruleInstance = false
  let nextInstance: number | undefined
  visitRule(prepared, start => {
    if (start < recurrenceId) before++
    else if (start === recurrenceId) ruleInstance = true
    else nextInstance = start
    return start < recurrenceId
  })
  if (!ruleInstance && !prepared.rdates.includes(recurrenceId)) {
    throw new Error(`Event ${series.id} has no occurrence at ${recurrenceId} to edit with its following occurrences`)
  }
  const oldRule = prepared.rule && (prepared.rule.count !== undefined
    ? { ...prepared.rule, count: Math.max(1, before) }
    : { ...prepared.rule, until: Math.min(prepared.rule.until ?? Infinity, recurrenceId - 1) })
  const earlier = (time: number) => time < recurrenceId
  const truncated: E = {
    ...series,
    recurrence: {
      ...recurrence,
      ...(oldRule ? { rule: ruleAsGiven(recurrence.rule!, oldRule, series, zone) } : {}),
      ...(recurrence.exdates ? { exdates: [...prepared.exdates].filter(earlier) } : {}),
      ...(recurrence.rdates ? { rdates: prepared.rdates.filter(earlier) } : {}),
    },
  }
  if (change === 'delete') {
    return events.filter(event => !(isOverrideOf(event, series.id) && event.recurrenceId! >= recurrenceId)).map(event => event === series ? truncated : event)
  }
  const newId = options.newSeriesId ?? `${series.id}:${recurrenceId}`
  if (!isId(newId)) throw invalidIdError('event', newId)
  // The override of the edited occurrence is dropped below, which frees its ID (the default ID of the new series).
  if (events.some(event => event?.id === newId && !isOverrideOf(event, series.id, recurrenceId))) throw new Error('Duplicate event ID: ' + newId)
  const move = moveOf(context)
  // The rest of the rule, unless the occurrence is an RDATE after the last rule instance.
  const rest = prepared.rule && (ruleInstance || nextInstance !== undefined)
    ? move.rule(prepared.rule.count !== undefined ? { ...prepared.rule, count: Math.max(1, prepared.rule.count - before) } : prepared.rule)
    : undefined
  const fromRdate = !ruleInstance && rest !== undefined
  const start = fromRdate ? move.shift(nextInstance!) : change.start
  const later = prepared.rdates.filter(time => time > recurrenceId).map(move.shift)
  const rdates = fromRdate ? [...new Set([change.start, ...later])].sort((a, b) => a - b) : later
  const following: E = withResource(context, {
    ...series, id: newId, start, end: fromRdate ? move.endOf(start) : change.end,
    recurrence: {
      ...withoutRule(recurrence),
      ...(rest ? { rule: ruleAsGiven(recurrence.rule!, rest, series, zone) } : {}),
      ...(recurrence.exdates ? { exdates: [...prepared.exdates].filter(time => !earlier(time)).map(move.shift) } : {}),
      ...(recurrence.rdates ? { rdates } : {}),
    },
  })
  const result: E[] = []
  for (const event of events) {
    if (event === series) result.push(truncated, following)
    else if (isOverrideOf(event, series.id, recurrenceId)) continue
    else if (isOverrideOf(event, series.id) && event.recurrenceId! > recurrenceId) result.push({ ...event, seriesId: newId, recurrenceId: move.shift(event.recurrenceId!) })
    else result.push(event)
  }
  return result
}

/**
 * Apply an edit of one occurrence of a recurring event to the events of a calendar and return the new events (the
 * input is not modified). `target` names the occurrence (`seriesId`, `recurrenceId`, as in
 * `EventCalendarEdit.occurrence`), `change` is its new `start`, `end` and optionally `resourceId`, or `'delete'`.
 *
 * - `occurrence`: a change adds an override event (`id` `<seriesId>:<recurrenceId>`, the series' fields without
 *   `recurrence`) or updates the existing one; a delete adds the start to the series' `exdates` and removes the
 *   override.
 * - `following`: the series ends before the occurrence (UNTIL one millisecond before it, or a smaller COUNT) and,
 *   for a change, a new series (`options.newSeriesId`, default `<seriesId>:<recurrenceId>`) starts at the changed
 *   occurrence with the rest of the instances (the remaining COUNT), exdates, rdates and overrides. When the
 *   occurrence is an RDATE rather than a rule instance, the new series starts at the next rule instance (moved like
 *   the occurrence) and the changed occurrence becomes one of its RDATEs, so the rule keeps its pattern; after the last
 *   rule instance the new series has no rule. For the first occurrence it is the same as `series`.
 * - `series`: the whole series moves by the change of the occurrence in local wall-clock time and takes its new
 *   duration; exdates, rdates, UNTIL and the `recurrenceId`s of overrides move with it. A delete removes the series and
 *   its overrides.
 *
 * When the change moves the occurrence to another local day, BYDAY weekdays and BYMONTHDAY days move by the same number
 * of days; the other parts of the rule are kept. A move to another day throws an Error when it would change what the
 * rule means: with BYDAY ordinals (such as `2MO`), BYSETPOS, BYMONTHDAY days outside 1–28 (or −28 to −1) before or
 * after the move, or BYMONTH when the occurrence moves to another month. Change the rule itself in those cases; a move
 * within the same day always works. An override of the edited occurrence is dropped by `following` and `series`, since
 * the change replaces it (so its ID, the default `newSeriesId`, is free again). The series zone is resolved as in
 * `expandRecurrence`. A rule given as text is returned as text.
 *
 * Throws an Error for an unknown series, an unknown scope, an ID that is already used and, with `following`, a
 * `recurrenceId` that is neither a rule instance nor an RDATE of the series; a RangeError for invalid times.
 */
export function applyRecurringEdit<E extends CalendarEvent>(
  events: readonly E[], target: RecurringEditTarget, change: RecurringEditChange | 'delete', scope: RecurringEditScope,
  options: RecurringEditOptions = {},
): E[] {
  if (!Array.isArray(events as unknown)) throw new RangeError('events must be an array')
  if (!scopes.includes(scope)) throw new Error('Unknown recurring edit scope: ' + String(scope))
  const recurrenceId = checkFinite(target?.recurrenceId, 'recurrenceId')
  const series = events.find(event => event?.id === target.seriesId && event.recurrence !== undefined)
  if (!series) throw new Error('Unknown recurring event: ' + String(target.seriesId))
  const recurrence = series.recurrence!
  if (change !== 'delete') {
    checkFinite(change?.start, 'change.start')
    checkFinite(change.end, 'change.end')
    if (change.end < change.start) throw new RangeError('change.end must not be before change.start')
  }
  const zone: RecurrenceZoneOptions = recurrence.timeZone !== undefined || recurrence.utcOffsetMinutes !== undefined
    ? { timeZone: recurrence.timeZone, utcOffsetMinutes: recurrence.utcOffsetMinutes } : { timeZone: options.timeZone }
  const context: EditContext<E> = { events, series, recurrence, prepared: prepare(seriesOf(series), options.timeZone), recurrenceId, zone, change }
  if (scope === 'occurrence') return editOccurrence(context)
  if (scope === 'series' || recurrenceId <= series.start) return editSeries(context)
  return editFollowing(context, options)
}
