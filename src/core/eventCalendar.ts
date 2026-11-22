// Calendar arithmetic and event layout for EventCalendar (day, week and month views), in epoch milliseconds.
// Days and weeks follow local dates in an IANA time zone (default UTC), so a day across a daylight-saving change has
// 23 or 25 hours and still starts at local midnight. Intervals are half-open `[start, end)`; a zero-duration event is
// a point in time. Nothing here reads the runtime's clock, locale or time zone.
import { checkId, invalidIdError, unknownReferenceError } from './ids.js'
import { zoneFormat, zoneOffset, zonedInstant } from './timeZone.js'
import type { CalendarRecurrence } from './recurrence.js'
import type { TimeRange } from './timeline.js'
import type { ChartTone } from './types.js'

const dayMs = 86_400_000

/** A view of EventCalendar: one day, one week or the weeks of one month. */
export type EventCalendarView = 'day' | 'week' | 'month'

/** An appointment of EventCalendar. `D` types the opaque `data`. */
export interface CalendarEvent<D = unknown> {
  /** Unique among the events of a calendar. */
  id: string
  /** Half-open interval `[start, end)` in epoch milliseconds. `end` must not be before `start`. */
  start: number
  end: number
  label: string
  /**
   * Draws the event in the all-day row of the day and week views and moves it by whole days. Give it local midnights
   * as `start` and `end`. Events of 24 hours or more are drawn in the all-day row too, but keep their times.
   */
  allDay?: boolean
  /** The resource (room, machine, person) of the event; with `resources`, the day view shows one column per resource. */
  resourceId?: string
  /** A CSS colour for the event's accent stripe. Overrides the tone colour. */
  color?: string
  /** Tone of the event background. Default `blue`. */
  tone?: ChartTone
  /** Set false to keep this event fixed while the others can be edited. Default true (unless the calendar is `readonly`). */
  editable?: boolean
  data?: D
  /**
   * Makes the event a recurring series whose `start` and `end` are the first instance. EventCalendar draws concrete
   * events only: expand series with `expandRecurringEvents` before passing them. Opt-in.
   */
  recurrence?: CalendarRecurrence
  /**
   * The series an occurrence (or an override of one) belongs to. With `recurrenceId`, EventCalendar adds `occurrence`
   * to its `edit` proposals and `labels.recurring` to the accessible name. Set by `expandRecurringEvents`.
   */
  seriesId?: string
  /** The original start (epoch milliseconds) of the occurrence in its series, as RFC 5545 RECURRENCE-ID. */
  recurrenceId?: number
}

/** A column of the per-resource day view. */
export interface CalendarResource {
  /** Unique among the resources of a calendar. */
  id: string
  label: string
  detail?: string
}

/** Time zone and week start of the calendar helpers. */
export interface EventCalendarOptions {
  /** IANA time zone, such as `Europe/Berlin`, whose local dates the days follow. Default `UTC`. */
  timeZone?: string
  /** First day of a week, 0 = Sunday to 6 = Saturday. Default 1 (Monday). */
  weekStartsOn?: number
}

/** One local day of a calendar view. */
export interface EventCalendarDay extends TimeRange {
  /** The local date: full year, month 1 to 12 and day of the month 1 to 31. */
  year: number
  month: number
  day: number
  /** Day of the week, 0 = Sunday to 6 = Saturday. */
  weekday: number
  /** False for the leading and trailing days of a month grid that belong to the previous or next month. */
  inMonth: boolean
}

/** Position of a timed event in a day column (`layoutCalendarDayEvents`). */
export interface CalendarEventColumn {
  id: string
  /** The event interval clipped to the day. */
  start: number
  end: number
  /** Zero-based column of the event among the events it overlaps, directly or through others. */
  column: number
  /** Number of columns of that overlapping group; the event takes `1 / columns` of the day's width. */
  columns: number
}

/** Placement of an event on the lanes of a row of days (`packCalendarEventLanes`). */
export interface CalendarEventLane {
  id: string
  /** Zero-based lane, from the top of the row. */
  lane: number
  /** Index of the first day the event covers, and one past the last one. */
  startIndex: number
  endIndex: number
  /** The event starts before the first covered day, or ends after the last one. */
  continuesBefore: boolean
  continuesAfter: boolean
}

export interface CalendarEventLaneLayout {
  /** The events that cover at least one of the days, in placement order. */
  segments: CalendarEventLane[]
  /** Number of lanes used (the largest lane plus one, or 0). */
  lanes: number
}

/** Proposal of EventCalendar `edit`: a move or resize of one event, and optionally a new resource. */
export interface EventCalendarEdit {
  id: string
  before: TimeRange
  after: TimeRange
  /** `move` keeps the duration; `start` and `end` resize one end. */
  mode: 'move' | 'start' | 'end'
  source: 'pointer' | 'keyboard'
  /** Present only when the proposal moves the event to another resource column of the day view. */
  resource?: { before: string; after: string }
  /**
   * Present only for an occurrence of a recurring series (an event with `seriesId` and `recurrenceId`): pass it to
   * `applyRecurringEdit` with the scope the user chose.
   */
  occurrence?: { seriesId: string; recurrenceId: number }
}

/** Proposal of EventCalendar `create`: a new event over an empty time range, drawn by pointer. */
export interface EventCalendarCreate extends TimeRange {
  /** True when it was drawn over whole days (the month view or the all-day row). */
  allDay: boolean
  /** The resource column it was drawn in, in the per-resource day view. */
  resourceId?: string
  source: 'pointer'
}

/** Synchronous check of an `edit` proposal: true or nothing accepts, false rejects with the default text, a string rejects with it. */
export type EventCalendarEditValidator = (change: EventCalendarEdit) => boolean | string | void
/** Synchronous check of a `create` proposal, with the same results as `EventCalendarEditValidator`. */
export type EventCalendarCreateValidator = (proposal: EventCalendarCreate) => boolean | string | void

/** Why EventCalendar cancelled an in-flight pointer gesture (`edit-cancel`). */
export type EventCalendarEditCancelReason = 'escape' | 'source-changed' | 'pointer-cancel' | 'api'

/** Payload of the EventCalendar `edit-cancel` event; `eventIds` is empty for a cancelled create. */
export interface EventCalendarEditCancel {
  reason: EventCalendarEditCancelReason
  eventIds: readonly string[]
}

/** Localizable texts of EventCalendar. Every field is optional in the `labels` prop. */
export interface EventCalendarLabels {
  /** Accessible name of the calendar region. Default "Event calendar". */
  region: string
  /** Toolbar buttons. Defaults "Previous", "Today" and "Next". */
  previous: string
  today: string
  next: string
  /** Name of the view switch group. Default "Calendar view". */
  views: string
  /** View names. Defaults "Day", "Week" and "Month". */
  day: string
  week: string
  month: string
  /** Heading of the all-day row. Default "All day". */
  allDay: string
  /** Word after the count of hidden events of a month day ("+2 more"). Default "more". */
  more: string
  /** Name prefix of the month day buttons that open the day view, followed by the date. Default "Show day". */
  showDay: string
  /** Description of editable timed events. */
  editHint: string
  /** Description of editable events of the all-day row. */
  dayEditHint: string
  /** Description of editable events of the month view, where Up and Down move by a week. Default: an English hint, or `dayEditHint` when only that is given. */
  monthEditHint?: string
  /** Announced when `validateEdit` returns false. Default "This change was rejected." */
  rejected: string
  /** Announced when `validateCreate` returns false. Default "This new event was rejected." */
  createRejected: string
  /** Heading of the resource columns of the day view. Default "Resources". */
  resources: string
  /** Label of the now line. Default "Now". */
  now: string
  /** Shown when there is nothing to draw, for example after invalid input. Default "No events to display". */
  empty: string
  /** Last part of the accessible name of an occurrence of a recurring series (with `seriesId`). Default "Recurring". */
  recurring?: string
}

const views: readonly EventCalendarView[] = ['day', 'week', 'month']

function checkTime(name: string, time: number) {
  if (typeof time !== 'number' || !Number.isFinite(time)) throw new RangeError(`${name} must be finite`)
}

function checkView(view: EventCalendarView) {
  if (!views.includes(view)) throw new RangeError('Unknown event calendar view: ' + String(view))
}

function resolve(options: EventCalendarOptions = {}) {
  const { timeZone = 'UTC', weekStartsOn = 1 } = options
  if (!Number.isInteger(weekStartsOn) || weekStartsOn < 0 || weekStartsOn > 6) throw new RangeError('weekStartsOn must be 0 to 6')
  return { zone: zoneFormat(timeZone), weekStartsOn }
}

type Zone = Intl.DateTimeFormat

/** The local wall-clock time of an instant, expressed as if it were UTC. */
function wallOf(zone: Zone, time: number) {
  return time + zoneOffset(zone, time)
}

/** The wall time of the local midnight that starts the day of an instant. */
function wallMidnight(zone: Zone, time: number) {
  return Math.floor(wallOf(zone, time) / dayMs) * dayMs
}

function dayAt(zone: Zone, midnight: number, inMonth = true): EventCalendarDay {
  const date = new Date(midnight)
  return {
    start: zonedInstant(zone, midnight), end: zonedInstant(zone, midnight + dayMs),
    year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate(), weekday: date.getUTCDay(), inMonth,
  }
}

function weekStartWall(midnight: number, weekStartsOn: number) {
  return midnight - ((new Date(midnight).getUTCDay() - weekStartsOn + 7) % 7) * dayMs
}

/** The first and last-plus-one wall midnights of the days a view shows around `date`. */
function viewWalls(view: EventCalendarView, date: number, zone: Zone, weekStartsOn: number) {
  const midnight = wallMidnight(zone, date)
  if (view === 'day') return { first: midnight, end: midnight + dayMs }
  if (view === 'week') {
    const first = weekStartWall(midnight, weekStartsOn)
    return { first, end: first + 7 * dayMs }
  }
  const at = new Date(midnight)
  const monthStart = Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), 1)
  const monthEnd = Date.UTC(at.getUTCFullYear(), at.getUTCMonth() + 1, 1)
  const first = weekStartWall(monthStart, weekStartsOn)
  const end = weekStartWall(monthEnd - dayMs, weekStartsOn) + 7 * dayMs
  return { first, end, monthStart, monthEnd }
}

/**
 * The half-open time range a view shows around `date`: the local day, the week that contains it (from `weekStartsOn`),
 * or the whole weeks of the month grid, including the leading and trailing days of the neighbouring months. Load the
 * events that overlap this range. Throws RangeError for an unknown view, a non-finite date, an invalid `weekStartsOn`
 * or time zone.
 */
export function eventCalendarRange(view: EventCalendarView, date: number, options?: EventCalendarOptions): TimeRange {
  checkView(view)
  checkTime('date', date)
  const { zone, weekStartsOn } = resolve(options)
  const { first, end } = viewWalls(view, date, zone, weekStartsOn)
  return { start: zonedInstant(zone, first), end: zonedInstant(zone, end) }
}

/**
 * The local days a view shows around `date`, in order: one for `day`, seven for `week` and the 28 to 42 days of the
 * month grid for `month` (`inMonth` is false for days of the neighbouring months).
 */
export function eventCalendarDays(view: EventCalendarView, date: number, options?: EventCalendarOptions): EventCalendarDay[] {
  checkView(view)
  checkTime('date', date)
  const { zone, weekStartsOn } = resolve(options)
  const walls = viewWalls(view, date, zone, weekStartsOn)
  const days: EventCalendarDay[] = []
  for (let wall = walls.first; wall < walls.end; wall += dayMs) {
    days.push(dayAt(zone, wall, walls.monthStart === undefined || (wall >= walls.monthStart && wall < walls.monthEnd!)))
  }
  return days
}

/** The month grid of `date`: four to six weeks of seven days each, starting on `weekStartsOn`. */
export function eventCalendarMonthGrid(date: number, options?: EventCalendarOptions): EventCalendarDay[][] {
  const days = eventCalendarDays('month', date, options)
  const weeks: EventCalendarDay[][] = []
  for (let index = 0; index < days.length; index += 7) weeks.push(days.slice(index, index + 7))
  return weeks
}

/**
 * The anchor date `steps` views before (negative) or after `date`: whole local days for `day`, weeks for `week` and
 * months for `month`, keeping the local time of day. A month step keeps the day of the month, clamped to the length of
 * the target month (January 31 + 1 month is February 28 or 29). Throws RangeError for a non-integer `steps`.
 */
export function shiftEventCalendarDate(view: EventCalendarView, date: number, steps: number, options?: EventCalendarOptions): number {
  checkView(view)
  checkTime('date', date)
  if (!Number.isInteger(steps)) throw new RangeError('steps must be an integer')
  const { zone } = resolve(options)
  const wall = wallOf(zone, date)
  if (view !== 'month') return zonedInstant(zone, wall + steps * (view === 'week' ? 7 : 1) * dayMs)
  const at = new Date(wall)
  const target = new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth() + steps, 1))
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate()
  target.setUTCDate(Math.min(at.getUTCDate(), last))
  target.setUTCHours(at.getUTCHours(), at.getUTCMinutes(), at.getUTCSeconds(), at.getUTCMilliseconds())
  return zonedInstant(zone, target.getTime())
}

/**
 * The local wall-clock time of `time` in milliseconds since the local midnight of `day` (any instant of that day). It
 * runs from 0 to 24 hours even on a 23- or 25-hour day, so a time grid stays 24 hours tall; repeated times of a
 * daylight-saving change share a position. Times before or after the day give negative or larger values.
 */
export function eventCalendarTimeOfDay(day: number, time: number, options?: Pick<EventCalendarOptions, 'timeZone'>): number {
  checkTime('day', day)
  checkTime('time', time)
  const { zone } = resolve(options)
  return wallOf(zone, time) - wallMidnight(zone, day)
}

/**
 * The instant of a local wall-clock `timeOfDay` (milliseconds since midnight, 0 to 24 hours) on the local day of `day`:
 * the inverse of `eventCalendarTimeOfDay`. A time skipped by a forward change resolves to the change; a repeated time
 * resolves to its earlier occurrence.
 */
export function eventCalendarTimeAt(day: number, timeOfDay: number, options?: Pick<EventCalendarOptions, 'timeZone'>): number {
  checkTime('day', day)
  checkTime('timeOfDay', timeOfDay)
  const { zone } = resolve(options)
  return zonedInstant(zone, wallMidnight(zone, day) + timeOfDay)
}

/** Ascending order by start, longer first, then by ID, so layouts never depend on input order. */
function compareEvents(a: { id: string; start: number; end: number }, b: { id: string; start: number; end: number }) {
  return a.start - b.start || b.end - a.end || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
}

function checkInterval(event: { id: string; start: number; end: number }) {
  if (!Number.isFinite(event.start) || !Number.isFinite(event.end) || event.end < event.start) {
    throw new RangeError(`Event ${event.id} must have finite start <= end`)
  }
}

/**
 * Side-by-side columns for the timed events of one day column (`range`, usually an `EventCalendarDay`). Events that
 * overlap the range (a zero-duration event when its time is inside it) are clipped to it and grouped with the events
 * they overlap, directly or through others; each group gets as many columns as it needs, and each event the first
 * column that is free at its start. Order: start, longer first, then ID, so the result does not depend on input order.
 * `minDuration` extends short events for the overlap test only, so events drawn taller than their duration (with a
 * minimum height) do not cover each other. Returns new objects in placement order.
 */
export function layoutCalendarDayEvents(
  events: readonly { id: string; start: number; end: number }[], range: TimeRange, options: { minDuration?: number } = {},
): CalendarEventColumn[] {
  checkTime('range.start', range.start)
  checkTime('range.end', range.end)
  if (range.end <= range.start) throw new RangeError('range.end must be after range.start')
  const { minDuration = 0 } = options
  if (!Number.isFinite(minDuration) || minDuration < 0) throw new RangeError('minDuration must be finite and nonnegative')
  const seen = new Set<string>()
  const clipped: { id: string; start: number; end: number; reach: number }[] = []
  for (const event of events) {
    checkId('event', event?.id, seen)
    checkInterval(event)
    const inside = event.end > event.start ? event.end > range.start && event.start < range.end : event.start >= range.start && event.start < range.end
    if (!inside) continue
    const start = Math.max(event.start, range.start), end = Math.min(event.end, range.end)
    clipped.push({ id: event.id, start, end, reach: Math.max(end, start + minDuration) })
  }
  clipped.sort(compareEvents)
  const result: CalendarEventColumn[] = []
  let group: CalendarEventColumn[] = []
  let columnEnds: number[] = []
  let groupEnd = -Infinity
  const close = () => {
    for (const item of group) item.columns = columnEnds.length
    group = []
    columnEnds = []
  }
  for (const event of clipped) {
    if (group.length && event.start >= groupEnd) close()
    let column = columnEnds.findIndex(end => end <= event.start)
    if (column < 0) column = columnEnds.push(event.reach) - 1
    else columnEnds[column] = event.reach
    groupEnd = Math.max(group.length ? groupEnd : -Infinity, event.reach)
    const placed = { id: event.id, start: event.start, end: event.end, column, columns: 1 }
    group.push(placed)
    result.push(placed)
  }
  close()
  return result
}

/**
 * Lanes for events over a row of days, such as a week of the month view or the all-day row of the week view. `days`
 * are ascending, non-overlapping ranges (usually `EventCalendarDay`s). Each event that overlaps a day (a zero-duration
 * event when its time is inside it) covers the days from its first to its last one and takes the lowest lane that is
 * free over all of them. Order: first day, more days first, start, then ID, so the result does not depend on input
 * order.
 */
export function packCalendarEventLanes(
  events: readonly { id: string; start: number; end: number }[], days: readonly TimeRange[],
): CalendarEventLaneLayout {
  for (let index = 0; index < days.length; index++) {
    const day = days[index]!
    checkTime('day start', day.start)
    checkTime('day end', day.end)
    if (day.end <= day.start || (index > 0 && day.start < days[index - 1]!.end)) {
      throw new RangeError('days must be ascending, non-overlapping ranges with end after start')
    }
  }
  const seen = new Set<string>()
  const covered: (CalendarEventLane & { start: number })[] = []
  for (const event of events) {
    checkId('event', event?.id, seen)
    checkInterval(event)
    const point = event.end === event.start
    let startIndex = -1, endIndex = -1
    for (let index = 0; index < days.length; index++) {
      const day = days[index]!
      const overlaps = point ? event.start >= day.start && event.start < day.end : event.start < day.end && event.end > day.start
      if (!overlaps) continue
      if (startIndex < 0) startIndex = index
      endIndex = index + 1
    }
    if (startIndex < 0) continue
    covered.push({
      id: event.id, start: event.start, lane: 0, startIndex, endIndex,
      continuesBefore: event.start < days[startIndex]!.start, continuesAfter: event.end > days[endIndex - 1]!.end,
    })
  }
  covered.sort((a, b) => a.startIndex - b.startIndex || (b.endIndex - b.startIndex) - (a.endIndex - a.startIndex)
    || a.start - b.start || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  const laneEnds: number[] = []
  const segments = covered.map(({ start: _start, ...segment }) => {
    let lane = laneEnds.findIndex(end => end <= segment.startIndex)
    if (lane < 0) lane = laneEnds.push(segment.endIndex) - 1
    else laneEnds[lane] = segment.endIndex
    return { ...segment, lane }
  })
  return { segments, lanes: laneEnds.length }
}

/**
 * Check the events and resources of EventCalendar: IDs are non-empty and unique (`Invalid event ID: …`, `Duplicate
 * event ID: …`, the same for `resource`), intervals are finite with `start <= end` (RangeError), and every
 * `resourceId` names a resource when `resources` is given (`Unknown resource in event <id>: <resourceId>`). A
 * `seriesId` must be a non-empty string (`Invalid series ID: …`) and a `recurrenceId` finite (RangeError).
 */
export function validateCalendarEvents(events: readonly CalendarEvent[], resources?: readonly CalendarResource[]): void {
  if (!Array.isArray(events as unknown)) throw new RangeError('events must be an array')
  let resourceIds: Set<string> | undefined
  if (resources !== undefined) {
    if (!Array.isArray(resources as unknown)) throw new RangeError('resources must be an array')
    resourceIds = new Set()
    for (const resource of resources) checkId('resource', resource?.id, resourceIds)
  }
  const seen = new Set<string>()
  for (const event of events) {
    checkId('event', event?.id, seen)
    if (typeof event.start !== 'number' || typeof event.end !== 'number') throw new RangeError(`Event ${event.id} must have finite start <= end`)
    checkInterval(event)
    if (event.resourceId !== undefined) {
      if (typeof event.resourceId !== 'string' || event.resourceId === '') throw invalidIdError('resource', event.resourceId)
      if (resourceIds && !resourceIds.has(event.resourceId)) throw unknownReferenceError('resource', 'event ' + event.id, event.resourceId)
    }
    if (event.seriesId !== undefined && (typeof event.seriesId !== 'string' || event.seriesId === '')) throw invalidIdError('series', event.seriesId)
    if (event.recurrenceId !== undefined && (typeof event.recurrenceId !== 'number' || !Number.isFinite(event.recurrenceId))) {
      throw new RangeError(`The recurrenceId of event ${event.id} must be finite`)
    }
  }
}
